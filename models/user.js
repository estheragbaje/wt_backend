const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { jwtSecret } = require('../config');

mongoose.promise = global.Promise;

const { Schema } = mongoose;

const UserSchema = new Schema({
  firstname: {
    type: String,
  },
  lastname: {
    type: String,
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
  },
  height: {
    type: Number,
  },
  heightUnit: {
    type: Schema.Types.ObjectId,
    ref: 'Unit'
  },
  weight: {
    type: Number,
  },
  weightUnit: {
    type: Schema.Types.ObjectId,
    ref: 'Unit'
  },
  goal: {
    type: String,
  },
  equipment: {
    type: Boolean,
  },
  experience: {
    type: String,
  },
  google: {
    id: String,
    token: String,
  },
  facebook: {
    id: String,
    token: String,
  },
  photo: {
    type: String
  },
  reminderType: {
    type: String,
    default: 'notification'
  }
});

UserSchema.pre('save', async function (next) {
  const user = this;
  if (!user.isModified('password')) return next();
  const hashedPassword = await bcrypt.hash(user.password, 12);
  user.password = hashedPassword;
  return next();
});

UserSchema.methods.generateJWT = function (remember = false) {
  return jwt.sign({ id: this._id, firstname: this.firstname }, jwtSecret, (!remember ? { expiresIn: '1h' } : null));
};

UserSchema.methods.validPassword = async function (password) {
  const isEqual = await bcrypt.compare(password, this.password);
  return isEqual;
};

// refreshToken is also available along with the accessToken
UserSchema.statics.asFacebookUser = async function ({ accessToken, profile }) {
  const User = this;
  const user = await User.findOne({ 'facebook.id': profile.id });
  // no user was found, create a new one
  if (!user) {
    const newUser = await User.create({
      firstname: profile.displayName || profile.givenName,
      lastname: profile.familyName,
      email: profile.emails[0].value,
      facebook: {
        id: profile.id,
        token: accessToken,
      },
      photo: profile._json.picture
      || 'https://cdn1.vectorstock.com/i/thumb-large/22/05/male-profile-picture-vector-1862205.jpg',
    });
    return newUser;
  }
  return user;
};

// refreshToken is also available along with the accessToken
UserSchema.statics.asGoogleUser = async function ({ accessToken, profile }) {
  const User = this;
  const existingUser = await User.findOne({ 'google.id': profile.id });
  // no user was found, create a new one
  if (!existingUser) {
    const newUser = await User.create({
      firstname: profile.displayName || profile.givenName,
      lastname: profile.familyName,
      email: profile.emails[0].value,
      google: {
        id: profile.id,
        token: accessToken,
      },
      photo: profile._json.picture
      || 'https://cdn1.vectorstock.com/i/thumb-large/22/05/male-profile-picture-vector-1862205.jpg',
    });
    return newUser;
  }
  return existingUser;
};

module.exports = mongoose.model('User', UserSchema);
