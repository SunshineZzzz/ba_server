'use strict';

const fs = require('fs');
const fsPromises = fs.promises;
process.env.NODE_CONFIG_DIR = '../app/config';
const getlogXmlParse = require('../app/common/logXmlParse.js');
let initSqlString = `DELIMITER ;

CREATE DATABASE \`basvr\` CHARACTER SET utf8 COLLATE utf8_general_ci;

USE basvr;

`;

// 生成初始化SQL语句
function createInitSql(logParse) {
  for(let [_, logObj] of logParse) {
    initSqlString += 'CREATE TABLE `' + logObj.logName + '` (\n';
    for (let [_, field] of logObj.field) {
      initSqlString += '  `' + field.name + '` ' + field.type.toUpperCase() + ' NOT NULL';
      if (field.desc !== undefined && field.desc.trim().length > 0) {
        initSqlString += ' COMMENT \'' + field.desc + '\'';
      }
      initSqlString += ',\n';
    }
    if (logObj.arrIndexs && logObj.arrIndexs.length > 0) {
      for (let index of logObj.arrIndexs) {
        if (index.trim().length === 0) {
          continue;
        }
        initSqlString += '  ' + index + ',\n';
      }
    }
    initSqlString = initSqlString.slice(0, initSqlString.length - 2);
    if (logObj.desc && logObj.desc.trim().length > 0) {
      initSqlString += `\n) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT '${logObj.desc}';\n\n`;
    } else {
      initSqlString += '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8;\n\n';
    }
  }
}

async function main() {
  let logParse = await getlogXmlParse();
  createInitSql(logParse.mapSingle);
  createInitSql(logParse.mapMultiple.tables);
  await fsPromises.writeFile('./install.sql', initSqlString)
  console.log('OK, Sql has been written to ./install.sql');
}

main().catch((e) => {
  console.error('exec error,%s', e.stack);
});