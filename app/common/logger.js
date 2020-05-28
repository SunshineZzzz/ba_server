'use strict';

const g = require('../global');
const fs = require('fs');
const log4js = require('log4js');
const config = require('config');

let loggerCfg = {
  path: config.has('logger.path') ? g.def(config.get('logger.path')) : g.APP_PATH + '/log/',
  name: config.has('logger.nane') ? config.get('logger.name') : "default.log",
  level: config.has('logger.level') ? config.get('logger.level') : 'info',
  host: config.has('logger.host') ? config.get('logger.host') : '127.0.0.1',
  port: config.has('logger.port') ? config.get('logger.port') : 5000
};

if (global.isMaster === true) {

  if (!fs.existsSync(loggerCfg.path)) {
    fs.mkdirSync(loggerCfg.path, 0o755);
  }
  fs.chmodSync(loggerCfg.path, 0o755);

  function tokensUser(logEvent) {
    return (process.pid === logEvent.pid) ? 'Master' : 'Worker';
  }

  log4js.configure({
    appenders: {
      out: {
        type: 'console', 
        layout: {
          type: 'pattern',
          pattern: '[%d] [%p] [%z-%x{user}] %m',
          tokens: {
            user: tokensUser
          }
        }        
      },
      file: { 
        type: 'dateFile', 
        filename: loggerCfg.path + loggerCfg.name,
        pattern: 'yyyyMMdd[hh]', 
        alwaysIncludePattern: true,
        keepFileExt: true,
        layout: {
          type: 'pattern',
          pattern: '[%d] [%p] [%z-%x{user}] %m',
          tokens: {
            user: tokensUser
          }
        }
      },
      server: { 
        type: 'tcp-server', 
        host: loggerCfg.host,
        port: loggerCfg.port
      }
    },
    categories: {
      default: { 
        appenders: ['file', 'out'],
        // appenders: ['file'],
        level: loggerCfg.level 
      }
    }
  });

} else {

  log4js.configure({
    appenders: {
      network: { 
        type: 'tcp', 
        host: loggerCfg.host,
        port: loggerCfg.port
      }
    },
    categories: {
      default: { 
        appenders: ['network'], 
        level: loggerCfg.level 
      }
    }
  });

}

loggerCfg = null;
module.exports = log4js.getLogger();