const Schedule = require('../../models/schedule');
const User = require('../../models/user');
const Workout = require('../../models/workout');
const Notification = require('../../models/notification');
const WorkoutResolver = require('../../graphql/resolvers/workout').Workout;

const {
  sendNotification, sendMail, SCHEDULED_WORKOUTS
} = require('../../helpers/helpers');

const { createWorkoutDL: WorkoutDataLoader } = require('../dataloaders/workout');

module.exports = {
  Query: {
    userSchedule: async (_, args, context) => {
      const userId = context.user.id;
      let calendarStart = new Date().setHours(0, 0, 0, 0);
      calendarStart = new Date(calendarStart).setMonth(new Date(calendarStart).getMonth() - 3);
      let calendarEnd = new Date().setHours(0, 0, 0, 0);
      calendarEnd = new Date(calendarEnd).setMonth(new Date(calendarEnd).getMonth() + 3);
      const userSchedule = await Schedule.find({
        userId,
        $or: [
          { startDate: { $gt: calendarStart, $lt: calendarEnd } },
          { routine: 'daily' },
          { routine: 'weekly' }
        ]
      }).sort({ startDate: 'asc' });
      const response = [];
      for (
        let day = new Date(calendarStart);
        day < new Date(calendarEnd);
        day.setDate(new Date(day).getDate() + 1)
      ) {
        const dayTime = day.getTime();
        const dayOfWeek = new Date(dayTime).getDay();
        const nextDay = new Date(dayTime).setDate(new Date(dayTime).getDate() + 1);
        userSchedule.forEach((schedule) => {
          const scheduleDate = new Date(schedule.startDate);
          const sDate = {
            h: scheduleDate.getHours(),
            m: scheduleDate.getMinutes(),
            s: scheduleDate.getSeconds(),
            ms: scheduleDate.getMilliseconds(),
          };
          if ((
            schedule.routine === 'daily'
            || (schedule.routine === 'weekly' && scheduleDate.getDay() === dayOfWeek))
            && schedule.startDate < dayTime
          ) {
            response.push({
              ...schedule._doc,
              id: schedule.id,
              startDate: new Date(day).setHours(sDate.h, sDate.m, sDate.s, sDate.ms)
            });
          } else if (schedule.startDate >= dayTime && schedule.startDate < nextDay) {
            response.push(schedule);
          }
        });
      }
      return response;
    },
    suggestionsByExperience: async (_, args, context) => {
      const userId = context.user.id;
      const user = await User.findById(userId);
      const workouts = await Workout.find();
      const workoutsExperience = await Promise.all(workouts.map(
        (workout) => WorkoutResolver.experience(workout, null, context)
      ));
      return workouts.map((workout, index) => ({
        ...workout._doc,
        id: workout.id,
        experience: workoutsExperience[index]
      })).filter((workout) => workout.experience === user.experience);
    },
    notifications: async (_, args, context) => {
      const notifications = await Notification.find({ userId: context.user.id });
      return notifications;
    }
  },
  Mutation: {
    pushNotification: async (_, {
      input: {
        userId, message, topic, subscription
      }
    }, { pubsub }) => {
      const receiver = _.user || await User.findById(userId);
      let newNotification = new Notification({
        userId,
        message,
        topic,
        type: receiver.reminderType
      });
      newNotification = await newNotification.save();
      if (receiver.reminderType === 'notification') {
        sendNotification(newNotification, pubsub, subscription);
      } else {
        sendMail(newNotification, receiver, subscription);
      }
      return newNotification;
    },
    scheduleWorkout: async (_, {
      input: {
        workoutId, startDate, reminderTime, routine
      }
    }, context) => {
      const userId = context.user.id;
      let schedule = new Schedule({
        workoutId, startDate, reminderTime, routine, userId
      });
      schedule = await schedule.save();
      return schedule;
    }
  },
  Subscription: {
    scheduledWorkoutAlert: {
      subscribe: (_, args, { pubsub }) => pubsub.asyncIterator(SCHEDULED_WORKOUTS)
    }
  },
  Schedule: {
    workoutId: (schedule, args, context) => WorkoutDataLoader(context).load(schedule.workoutId)
  }
};
