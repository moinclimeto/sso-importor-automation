import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PART_C_LETTER_TEMPLATES = {
  coveringLetter: {
    id: 'coveringLetter',
    file: 'covering-letter.docx',
    title: 'Covering Letter',
    fileName: 'Covering_Letter.docx',
  },
  selfDeclaration: {
    id: 'selfDeclaration',
    file: 'self-declaration.docx',
    title: 'Self-Declaration (Audited Statement)',
    fileName: 'Self_Declaration.docx',
  },
  largeEntity: {
    id: 'largeEntity',
    file: 'large-entity-declaration.docx',
    title: 'Large-Entity Declaration',
    fileName: 'Large_Entity_Declaration.docx',
  },
};

export function getPartCTemplatesDir() {
  const candidates = [
    path.join(__dirname, '..', 'templates', 'part-c'),
    path.join(process.resourcesPath || '', 'app.asar', 'electron', 'templates', 'part-c'),
    path.join(process.resourcesPath || '', 'templates', 'part-c'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'covering-letter.docx'))) || candidates[0];
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function collapseSplitPlaceholders(xml) {
  return xml.replace(/\{\{[\s\S]*?\}\}/g, (match) => {
    const key = match.replace(/<[^>]+>/g, '').replace(/^\{\{|\}\}$/g, '').trim();
    return `{{${key}}}`;
  });
}

function paragraphText(block) {
  return [...String(block).matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
}

function stripTemplateNotes(xml) {
  let next = xml.replace(/<w:tbl[\s\S]*?<\/w:tbl>/g, (tbl) => (
    /Template Notes|Suggested mapping|Portal data field/i.test(paragraphText(tbl)) ? '' : tbl
  ));
  next = next.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, (p) => (
    /Template Notes|Suggested mapping|Portal data field|Replace each \{\{/i.test(paragraphText(p)) ? '' : p
  ));
  return next;
}

function applyValues(xml, values) {
  const expanded = { ...(values || {}) };
  const org = String(expanded.OrganizationName || expanded.OrganizationName || '').trim();
  let next = collapseSplitPlaceholders(xml);
  next = stripTemplateNotes(next);

  if (org) {
    next = next.replace(/\[\s*COMPANY LETTERHEAD\s*\]/gi, xmlEscape(org));
  }

  for (const [key, raw] of Object.entries(expanded)) {
    next = next.split(`{{${key}}}`).join(xmlEscape(raw ?? ''));
  }

  next = next.replace(/\{\{[A-Za-z0-9]+\}\}/g, '');
  return next;
}

function extractParagraphs(xml) {
  const paragraphs = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let match;
  while ((match = re.exec(xml))) {
    const block = match[0];
    const text = [...block.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
      .map((m) => m[1])
      .join('')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

export async function buildFilledDocx(templateId, values = {}) {
  const meta = PART_C_LETTER_TEMPLATES[templateId];
  if (!meta) throw new Error(`Unknown letter template: ${templateId}`);

  const templatePath = path.join(getPartCTemplatesDir(), meta.file);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Letter template missing: ${meta.file}`);
  }

  const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Invalid Word template (document.xml missing)');

  const xml = applyValues(await docFile.async('string'), values);
  zip.file('word/document.xml', xml);

  const buffer = Buffer.from(await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  }));

  return {
    ...meta,
    buffer,
    paragraphs: extractParagraphs(xml),
  };
}

export async function previewPartCLetters({ templateIds = [], values = {} } = {}) {
  const letters = [];
  for (const id of templateIds) {
    const filled = await buildFilledDocx(id, values);
    letters.push({
      id: filled.id,
      title: filled.title,
      fileName: filled.fileName,
      paragraphs: filled.paragraphs,
    });
  }
  return { letters };
}

export async function zipPartCLetters({ templateIds = [], values = {} } = {}) {
  const zip = new JSZip();
  const names = [];
  for (const id of templateIds) {
    const filled = await buildFilledDocx(id, values);
    zip.file(filled.fileName, filled.buffer);
    names.push(filled.fileName);
  }
  const buffer = Buffer.from(await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  }));
  return { buffer, fileName: 'EPR_Ready_Letters.zip', names };
}
