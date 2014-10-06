// dependencies
const io = require('socket.io-client');
const extend = require('extend');
const EventEmitter = require('events').EventEmitter;
const util = require('util');

function Transport(opts) {
  const defaults = {
    host: 'http://127.0.0.1:30000'
  };

  EventEmitter.call(this);

  this.options = extend({}, defaults, opts || {});
  this._socket = this._createSocket(this.options.host);
}

util.inherits(Transport, EventEmitter);

Transport.prototype._createSocket = function _createSocket(host) {
  var socket = io.connect(host);
  socket.on('connect', this._onSocketConnected.bind(this));
  socket.on('disconnect', this._onSocketDisconnected.bind(this));

  return socket;
};

Transport.prototype._onSocketConnected = function _onSocketConnected() {
  this.emit('connected');
};

Transport.prototype._onSocketDisconnected = function _onSocketDisconnected() {
  this.emit('disconnected');
};

Transport.prototype.send = function send(name, data) {
  if (!this._socket.connected || this._socket.disconnected) {
    return;
  }

  this._socket.emit(name, data);
};

exports = module.exports = Transport;
