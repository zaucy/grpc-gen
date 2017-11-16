// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var test_pb = require('./test_pb.js');

function serialize_TestMessage(arg) {
  if (!(arg instanceof test_pb.TestMessage)) {
    throw new Error('Expected argument of type TestMessage');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_TestMessage(buffer_arg) {
  return test_pb.TestMessage.deserializeBinary(new Uint8Array(buffer_arg));
}


var TestServiceService = exports.TestServiceService = {
  test: {
    path: '/TestService/test',
    requestStream: false,
    responseStream: false,
    requestType: test_pb.TestMessage,
    responseType: test_pb.TestMessage,
    requestSerialize: serialize_TestMessage,
    requestDeserialize: deserialize_TestMessage,
    responseSerialize: serialize_TestMessage,
    responseDeserialize: deserialize_TestMessage,
  },
};

exports.TestServiceClient = grpc.makeGenericClientConstructor(TestServiceService);
