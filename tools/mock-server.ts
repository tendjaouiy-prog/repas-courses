// Faux script Google pour essayer l'appli sans toucher au vrai Sheet :
//   npx vite-node tools/mock-server.ts   (URL : http://localhost:8787/exec, code : test)
// Il exécute le vrai apps-script/Code.gs sur un Sheet en mémoire.
import { createServer } from 'node:http';
import source from '../apps-script/Code.gs?raw';
import { sampleSpreadsheet } from '../src/lib/fakeSheet';

const ss = sampleSpreadsheet();
const api = new Function(
  'SpreadsheetApp',
  'LockService',
  'ContentService',
  'Utilities',
  `${source.replace("var CODE = 'CHANGE-MOI';", "var CODE = 'test';")}; return { doPost: doPost };`,
)(
  { getActiveSpreadsheet: () => ss, flush: () => {} },
  { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
  { formatDate: () => '' },
);

createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.end(req.method === 'POST' ? api.doPost({ postData: { contents: body } }).text : '{"ok":true}');
  });
}).listen(8787, () => console.log('faux script sur http://localhost:8787/exec (code : test)'));
