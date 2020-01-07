const { gql } = require('apollo-server-express');
const authSchema = require('./auth.graphql');
const unitSchema = require('./unit.graphql');
const exerciseSchema = require('./exercise.graphql');

const rootSchema = gql`
  type Query {
    _: Boolean
  }
  type Mutation {
    _: Boolean
  }
  ${authSchema}
  ${unitSchema}
  ${exerciseSchema}
`;

module.exports = rootSchema;
