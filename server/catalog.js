// 아이템 목록(가격·부위·착용 규칙)을 서버에서도 쓴다. 구매·착용을 서버가 확인하기 위해서다.
// 목록은 화면 파일(public/js/hairs.js, items.js) 하나만 고치면 되도록 그 파일을 그대로 읽어 실행한다.
// 두 파일은 읽을 때 PX 에 값을 넣기만 하고 화면(DOM)은 아이콘을 그릴 때만 쓰므로 여기서도 돌아간다.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'public', 'js');

function loadCatalog() {
  const sandbox = { PX: {} };
  vm.createContext(sandbox);
  for (const file of ['hairs.js', 'items.js']) {
    vm.runInContext(fs.readFileSync(path.join(JS_DIR, file), 'utf8'), sandbox, { filename: file });
  }
  const items = sandbox.PX.items;
  return {
    byId: (id) => items.byId(id),
    // 같은 부위·겹치는 부위(한벌옷과 상하의)를 벗기고 입힌 결과
    equipToggle: (ids, id) => items.equipToggle(ids, id),
    starterItems: () => items.starterItems(),
    count: items.list.length
  };
}

module.exports = { loadCatalog };
