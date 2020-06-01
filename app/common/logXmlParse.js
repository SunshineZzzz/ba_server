'use strict';

const g = require('../global');
const util = require('util');
const fs = require('fs');
const _ = require('underscore');
const config = require('config');
const parseString = require('xml2js').parseString;
const promiseParseString = util.promisify(parseString);
const readFile = util.promisify(fs.readFile);

async function parseXML() {
  let logXmlFile = config.has('app.logXmlFile') ? g.def(config.get('app.logXmlFile')) : g.APP_PATH + 'app/config/log.xml';
  let xmlStr = await readFile(logXmlFile, 'utf8');
  let xmlObj = await promiseParseString(xmlStr);
  let logStructs = xmlObj.metalib.struct;
  let logXml = new Map();
  if (_.isUndefined(logStructs)) {
    return logXml;
  }
  for (let i = 0; i < logStructs.length; ++i) {
    if (_.isUndefined(logStructs[i].$) || 
        _.isUndefined(logStructs[i].$.name) || 
        _.isUndefined(logStructs[i].$.id) || 
        _.isUndefined(logStructs[i].entry)) {
      continue;
    }
    let logObj = {};
    let attrStruct = logStructs[i].$;
    logObj.logName = attrStruct.name;
    logObj.logId = attrStruct.id;
    if (!_.isUndefined(attrStruct.desc)) {
      logObj.desc = attrStruct.desc;
    }
    if (attrStruct.indexkey && attrStruct.indexkey.trim()) {
      logObj.arrIndexs = [];
      for(let index of attrStruct.indexkey.split('|')) {
        if (index.trim())
        {
          logObj.arrIndexs.push(index);
        }
      }
    }
    let entrys = logStructs[i].entry;
    logObj.field = new Map();
    let maxNumber = 0;
    for (let j = 0; j < entrys.length; ++j) {
      if (_.isUndefined(entrys[j].$) || 
          _.isUndefined(entrys[j].$.name) || 
          _.isUndefined(entrys[j].$.type) || 
          _.isUndefined(entrys[j].$.number)) {
        logObj = null;
        break;
      }
      let entry = entrys[j].$;
      if(logObj.field.has(entry.number)) {
        logObj = null;
        break;
      }
      logObj.field.set(entry.number, {});
      let elem = logObj.field.get(entry.number);
      elem.number = entry.number;
      elem.type = entry.type;
      elem.name = entry.name;
      if (!_.isUndefined(entry.desc)) {
        elem.desc = entry.desc;
      }
      let n = parseInt(elem.number, 10);
      if (maxNumber < n) {
        maxNumber = n;
      }
    }
    if(!_.isNull(logObj) && logObj.field.size > 0) {
      logObj.maxNumber = maxNumber;
      logXml.set(logObj.logId, logObj);
    }
  }

  return logXml;
};

module.exports = parseXML;