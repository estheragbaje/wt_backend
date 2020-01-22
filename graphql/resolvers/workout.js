const { GraphQLUpload } = require('graphql-upload');
const Workout = require('../../models/workout');
const WorkoutSession = require('../../models/workoutSession');
const { searchBy } = require('../../helpers/helpers');
const cloudinary = require('../../helpers/cloudinary');
const WorkoutExercises = require('../../models/workoutExercise');

const { createExerciseDL: ExerciseDataLoader } = require('../dataloaders/exercise');
const { createWorkoutSessionDL: WorkoutSessionDataLoader } = require('../dataloaders/workoutSession');

const exerciseDifficultyToInt = (difficulty) => {
  if (difficulty === 'Beginner') {
    return 1;
  }
  if (difficulty === 'Intermediate') {
    return 2;
  }
  return 3;
};

const exerciseTimeByWorkoutIntensity = (intensity) => {
  if (intensity === 'Low') return 20;
  if (intensity === 'Moderate') return 30;
  return 40; // high
};

module.exports = {
  Query: {
    workouts: async (_, { input }) => {
      const workouts = await Workout.find(searchBy(input));
      return workouts;
    },
    workout: async (_, { id }) => {
      const workout = await Workout.findById(id);
      return { ...workout._doc, id: workout.id };
    },
    completedWorkouts: async (_, args, context) => WorkoutSession.find({ userId: context.user.id, endDate: { $ne: null } }).sort({ endDate: -1 }).populate('workoutId'),
  },
  Mutation: {
    workoutSession: async (_, { input }, context) => {
      const {
        userId, workoutId, exerciseId, exerciseTimer, pause, end
      } = input;
      let workoutSession = await WorkoutSessionDataLoader(context).load({ userId, workoutId });
      if (typeof pause === 'undefined' && typeof end === 'undefined') {
        // start session
        if (workoutSession === null) {
          workoutSession = new WorkoutSession({
            userId,
            workoutId,
            exerciseId,
            exerciseTimer,
            startDate: Date.now(),
            pause: false,
            endDate: null,
            picture: null,
            weight: null
          });
          workoutSession = await workoutSession.save();
        } else {
          workoutSession = await WorkoutSession.findOneAndUpdate(
            { _id: workoutSession.id },
            {
              exerciseId,
              exerciseTimer,
              pause: false
            },
            { new: true }
          );
        }
      } else if (typeof end === 'undefined') {
        // pause session
        if (workoutSession && workoutSession._doc.pause !== pause) {
          workoutSession = await WorkoutSession.findOneAndUpdate(
            { _id: workoutSession.id },
            {
              exerciseId,
              exerciseTimer,
              pause
            },
            { new: true }
          );
        }
      } else if (workoutSession && workoutSession._doc.endDate === null) {
        // end session
        workoutSession = await WorkoutSession.findOneAndUpdate(
          { _id: workoutSession.id },
          {
            exerciseId,
            exerciseTimer,
            pause: true,
            endDate: Date.now()
          },
          { new: true }
        );
      }
      return workoutSession ? { ...workoutSession._doc, id: workoutSession.id } : null;
    },
    updateCompletedWorkout: async (_, { input: { sessionId, file, weight } }) => {
      try {
        console.log('received:', sessionId, file);
        let image = await file;
        console.log('await file before upload', image);
        const upload = new Promise((resolves, rejects) => {
          const { filename, mimetype, createReadStream } = image;
          let filesize = 0;
          const stream = createReadStream();
          stream.on('data', (chunk) => {
            filesize += chunk.length;
          });
          stream.once('end', () => resolves({
            filename,
            mimetype,
            filesize,
            path: stream.path
          }));
          stream.on('error', rejects);
        });
        image = await upload;
        console.log('await upload', image);
        const allowedFileTypes = ['image/jpeg', 'image/png'];
        if (!allowedFileTypes.includes(image.mimetype)) throw new Error('Invalid file mimetype');
        if (image.filesize > 1000000) throw new Error('File exceeded maximum allowed size');
        image = await cloudinary(image.path);
        console.log('await cloudinary', image);
        return WorkoutSession.findOneAndUpdate(
          { _id: sessionId },
          { picture: image.url, weight },
          { new: true }
        );
      } catch (err) {
        throw new Error(err.message);
      }
    },
    customWorkout: async (_, { input }, context) => {
      const {
        userId, name, description, intensity, picture, exercises,
        equipment, muscles, types, experience
      } = input;
      let customWorkout = new Workout({
        userId,
        name,
        description,
        intensity,
        picture,
        exercises,
        equipment,
        muscles,
        types,
        experience
      });
      exercises.map(async (exerciseId) => {
        let eachWorkoutExercise = new WorkoutExercises({
          workoutId: customWorkout.id,
          exerciseId,
          time: exerciseTimeByWorkoutIntensity(customWorkout.intensity)
        });
        eachWorkoutExercise = await eachWorkoutExercise.save();
        return eachWorkoutExercise;
      });
      customWorkout = await customWorkout.save();
      ExerciseDataLoader(context).load(customWorkout.id);
      return customWorkout;
    }
  },
  Workout: {
    exercises: (workout, args, context) => ExerciseDataLoader(context).load(workout.id),
    avgTime: async (workout, args, context) => {
      const workoutExercises = await ExerciseDataLoader(context).load(workout.id);
      const totalSeconds = workoutExercises.reduce((time, ex) => time + ex.time, 0);
      const minutes = (Math.floor(totalSeconds / 60)).toString().padStart(2, '0');
      const seconds = (totalSeconds % 60).toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    },
    equipment: async (workout, args, context) => {
      const workoutExercises = await ExerciseDataLoader(context).load(workout.id);
      const equipment = [];
      workoutExercises.forEach((exercise) => {
        if (exercise.equipment && !equipment.includes(exercise.equipment)) {
          equipment.push(exercise.equipment);
        }
      });
      return equipment.join(', ');
    },
    muscles: async (workout, args, context) => {
      const workoutExercises = await ExerciseDataLoader(context).load(workout.id);
      const muscles = [];
      workoutExercises
        .forEach((exercise) => {
          if (exercise.muscle && !muscles.includes(exercise.muscle)) {
            muscles.push(exercise.muscle);
          }
        });
      return muscles.join(', ');
    },
    session: async (workout, args, context) => {
      const userId = context.user.id;
      const workoutId = workout.id;
      const workoutSession = await WorkoutSessionDataLoader(context).load({ userId, workoutId });
      if (workoutSession !== null) return { ...workoutSession._doc, id: workoutSession.id };
      return null;
    },
    types: async (workout, args, context) => {
      const workoutExercises = await ExerciseDataLoader(context).load(workout.id);
      const types = [];
      workoutExercises
        .forEach((exercise) => {
          if (exercise.type && !types.includes(exercise.type)) {
            types.push(exercise.type);
          }
        });
      return types.join(', ');
    },
    experience: async (workout, args, context) => {
      const workoutExercises = await ExerciseDataLoader(context).load(workout.id);
      const experience = workoutExercises.reduce(
        (total, exercise) => total + exerciseDifficultyToInt(exercise.difficulty), 0
      ) / workoutExercises.length;
      if (experience < 1.5) return 'Beginner';
      if (experience < 2.15) return 'Intermediate';
      return 'Expert';
    }
  },
  Upload: GraphQLUpload,
  WorkoutSession: {
    workoutId: async (session) => {
      const workout = await Workout.findById(session.workoutId);
      return { ...workout._doc, id: workout.id };
    }
  }
};
