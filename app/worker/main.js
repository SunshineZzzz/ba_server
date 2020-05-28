'use strict';

global.isMaster = false;
global.print = console.log.bind(console);
const eixtCode = require('../common/errorCode').eixtCode;
const network = require('../common/network');
const logger = require('../common/logger');
const heartBeat = require('../common/heartBeat');
const getlogXmlParse = require('../common/logXmlParse');

async function init() {
  logger.info('create worker success');
  let logParse = await getlogXmlParse();
  process.on('message', (msg, obj) => {
    if (msg === 'socket') {
      if (obj) {
        network.handleConnection(logParse, obj);
      }
    } else if (msg === 'heartBeat') {
      heartBeat.updateTime();
    }
  });
}

init().catch((e) => {
  logger.error(e);
  process.exit(eixtCode.startErr);
});

require('../process');