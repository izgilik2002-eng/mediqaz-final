const fs = require('fs');
const path = require('path');

const ttf = fs.readFileSync('font.ttf');
const b64 = ttf.toString('base64');

const output = [
  '// Roboto Regular — полная кириллица (русский + казахский)',
  '(function() {',
  '  var font = "' + b64 + '";',
  '  var callAddFont = function() {',
  '    this.addFileToVFS("PTSans-Regular.ttf", font);',
  '    this.addFont("PTSans-Regular.ttf", "PTSans", "normal");',
  '  };',
  '  if (typeof window !== "undefined" && window.jspdf && window.jspdf.jsPDF) {',
  '    window.jspdf.jsPDF.API.events.push(["addFonts", callAddFont]);',
  '  }',
  '})();',
].join('\n');

const outPath = path.join('mediqaz-extension', 'lib', 'PTSans-Regular.js');
fs.writeFileSync(outPath, output);

try { fs.unlinkSync('font.ttf'); } catch(e) {}
try { fs.unlinkSync('gen_font.js'); } catch(e) {}

console.log('Done! Size: ' + Math.round(output.length / 1024) + ' KB');
