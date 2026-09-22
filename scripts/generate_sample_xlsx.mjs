import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const rows = [
  { Departamento: 'Administrativo', Setor: 'TI', Subsetor: 'Suporte' },
  { Departamento: 'Administrativo', Setor: 'TI', Subsetor: 'Infraestrutura' },
  { Departamento: 'Financeiro', Setor: 'Contabilidade', Subsetor: '' },
  { Departamento: 'Operações', Setor: 'Logística', Subsetor: 'Transporte' },
  { Departamento: 'Operações', Setor: 'Produção', Subsetor: '' },
];

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

const outDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'sample_company_structure.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Wrote', outPath);
