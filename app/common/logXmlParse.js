'use strict';

const g = require('../global');
const util = require('util');
const fs = require('fs');
const _ = require('underscore');
const config = require('config');
const common = require('./common');
const parseString = require('xml2js').parseString;
const promiseParseString = util.promisify(parseString);
const readFile = util.promisify(fs.readFile);

// 解析Single的struct项目
function parseSingle(singleStructs) {
  let mapSingle = new Map();

  if (_.isUndefined(singleStructs)) {
    return mapSingle;
  }

  for (let i = 0; i < singleStructs.length; ++i) {
    if (_.isUndefined(singleStructs[i].$) || 
        !common.isValidStr(singleStructs[i].$.name) || 
        !common.strIsNumber(singleStructs[i].$.id) || 
        _.isUndefined(singleStructs[i].entry)) {
      continue;
    }
    let logObj = {};
    let attrStruct = singleStructs[i].$;
    logObj.logName = attrStruct.name.trim();
    logObj.logId = attrStruct.id.trim();
    if (common.isValidStr(attrStruct.desc)) {
      logObj.desc = attrStruct.desc.trim();
    }
    if (attrStruct.indexkey && attrStruct.indexkey.trim().length > 0) {
      logObj.arrIndexs = [];
      for(let index of attrStruct.indexkey.split('|')) {
        if (common.isValidStr(index)) {
          logObj.arrIndexs.push(index.trim());
        }
      }
    }
    let entrys = singleStructs[i].entry;
    logObj.field = new Map();
    let maxNumber = 0;
    for (let j = 0; j < entrys.length; ++j) {
      if (_.isUndefined(entrys[j].$) || 
          !common.isValidStr(entrys[j].$.name) || 
          !common.isValidStr(entrys[j].$.type) || 
          !common.isAllowNumberProp(entrys[j].$.number)) {
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
      if (common.isValidStr(entry.desc)) {
        elem.desc = entry.desc.trim();
      }
      let n = parseInt(elem.number, 10);
      if (maxNumber < n) {
        maxNumber = n;
      }
    }
    if(!_.isNull(logObj) && logObj.field.size > 0) {
      logObj.maxNumber = maxNumber;
      mapSingle.set(logObj.logId, logObj);
    }
  }

  return mapSingle;
}

// 解析Multiple的struct项目
function parseMultiple(multipleStructs) {
  let mapMultiple = {
    tables: new Map(),
    ids: new Map()
  };

  if (_.isUndefined(multipleStructs)) {
    return mapMultiple;
  }

  for (let i = 0; i < multipleStructs.length; ++i) {
    if (_.isUndefined(multipleStructs[i].$) || 
        !common.isValidStr(multipleStructs[i].$.name) || 
        !common.isValidStr(multipleStructs[i].$.ids) || 
        !common.isValidStr(multipleStructs[i].$.script) || 
        _.isUndefined(multipleStructs[i].entry)) {
      continue;
    }

    let logObj = {};
    let attrStruct = multipleStructs[i].$;
    logObj.logName = attrStruct.name.trim();
    logObj.script = attrStruct.script.trim();
    if (common.isValidStr(attrStruct.desc)) {
      logObj.desc = attrStruct.desc.trim();
    }
    if (common.isValidStr(attrStruct.indexkey)) {
      logObj.arrIndexs = [];
      for(let index of attrStruct.indexkey.split('|')) {
        if (common.isValidStr(index)) {
          logObj.arrIndexs.push(index.trim());
        }
      }
    }
    let entrys = multipleStructs[i].entry;
    logObj.field = new Map();
    for (let j = 0; j < entrys.length; ++j) {
      if (_.isUndefined(entrys[j].$) || 
          !common.isValidStr(entrys[j].$.name) || 
          !common.isValidStr(entrys[j].$.type)) {
        logObj = null;
        break;
      }

      let entry = entrys[j].$;
      if(logObj.field.has(entry.name)) {
        logObj = null;
        break;
      }
      logObj.field.set(entry.name, {});
      let elem = logObj.field.get(entry.name);
      elem.type = entry.type;
      elem.name = entry.name;
      if (common.isValidStr(entry.desc)) {
        elem.desc = entry.desc.trim();
      }
    }
    if (_.isNull(logObj) || logObj.field.size <= 0) {
      continue;
    }
    if (!common.isValidStr(multipleStructs[i].$.ids)) {
      continue;
    }
    let arrId = (multipleStructs[i].$.ids).split('|');
    let bErrId = true;
    for (let id of arrId) {
      if (!common.isValidStr(id)) {
        break;
      }
      let setElem = mapMultiple.ids.get(id.trim());
      if (!_.isUndefined(setElem) && setElem.has(logObj.logName)) {
        break;
      }
      bErrId = false;
    }
    if (bErrId) {
      continue;
    }
    logObj.ids = new Map();
    for (let id of arrId) {
      id = id.trim();
      if(!mapMultiple.ids.has(id)) {
        mapMultiple.ids.set(id, new Map());
      }
      mapMultiple.ids.get(id).set(logObj.logName, id);
      logObj.ids.set(id, logObj.logName);
    }
    mapMultiple.tables.set(logObj.logName, logObj);
  }

  return mapMultiple;
}

// 解析日志的XML
async function parseXML() {
  let logXmlFile = config.has('app.logXmlFile') ? g.def(config.get('app.logXmlFile')) : g.APP_PATH + 'app/config/log.xml';
  let xmlStr = await readFile(logXmlFile, 'utf8');
  let xmlObj = await promiseParseString(xmlStr);
  let logXml = {
    mapSingle: new Map(),
    mapMultiple: {
      tables: new Map(),
      ids: new Map(),
    },
    getSingleObj: function(id) {
      return this.mapSingle.get(id);
    },
    getMultiIdObj: function(id) {
      return this.mapMultiple.ids.get(id);
    },
    getMultiTableObj: function(name) {
      return this.mapMultiple.tables.get(name);
    },
    serialize: function(space = '  ') {
      let toolObj = {};
      let str = common.mapOrSetSerialize(this.mapSingle, space);
      toolObj.mapSingle = JSON.parse(str);
      for (let index in toolObj.mapSingle) {
        let k = toolObj.mapSingle[index][0];
        let v = toolObj.mapSingle[index][1];
        (v).field = [...this.mapSingle.get(k).field];
      }
      toolObj.mapMultiple = {};
      str = common.mapOrSetSerialize(this.mapMultiple.tables, space);
      toolObj.mapMultiple.tables = JSON.parse(str);
      for (let index in toolObj.mapMultiple.tables) {
        let k = toolObj.mapMultiple.tables[index][0];
        let v = toolObj.mapMultiple.tables[index][1];
        (v).field = [...this.mapMultiple.tables.get(k).field];
        (v).ids = [...this.mapMultiple.tables.get(k).ids];
      }
      str = common.mapOrSetSerialize(this.mapMultiple.ids, space);
      toolObj.mapMultiple.ids = JSON.parse(str);
      for (let index in toolObj.mapMultiple.ids) {
        let k = toolObj.mapMultiple.ids[index][0];
        toolObj.mapMultiple.ids[index][1] = [...this.mapMultiple.ids.get(k).entries()];
      }
      str = JSON.stringify(toolObj, null, space);
      toolObj.mapSingle = null;
      toolObj.mapMultiple.tables = null;
      toolObj.mapMultiple.ids = null;
      toolObj.mapMultiple = null;
      toolObj = null;
      return str;
    }
  };
  for (let i = 0; i < xmlObj.metalib.command.length; ++i) {
    if (xmlObj.metalib.command[i].$.name === 'Single') {
      logXml.mapSingle = null;
      logXml.mapSingle = parseSingle(xmlObj.metalib.command[i].struct);
    } else if (xmlObj.metalib.command[i].$.name === 'Multiple') {
      logXml.mapMultiple = null;
      logXml.mapMultiple = parseMultiple(xmlObj.metalib.command[i].struct);
    }
  }
  // console.log(logXml);
  // console.log(logXml.serialize());
  // await common.sleep(10);
  return logXml;
}

module.exports = parseXML;