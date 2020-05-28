'use strict';

const path = require('path');
const events = require('events');

let g = {};

if (g.APP_PATH === void 0) {
  g.APP_PATH = path.join(__dirname, '../');
}

if (g.dispatcher === void 0) {
  g.dispatcher = new events.EventEmitter();
  g.dispatcher.setMaxListeners(0);
}

g.def = function (str) {
  let paramRegex = /\$\{(\w+)\}/g;
  str = str.replace(paramRegex, function (match, p1) {
    if (g[p1] !== void(0)) {
      return g[p1];
    } else {
      return match;
    }
  });
  return str;
};

module.exports = g;