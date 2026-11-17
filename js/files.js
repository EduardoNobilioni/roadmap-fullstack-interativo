const WIN = {
  'á': 0xe1, 'à': 0xe0, 'â': 0xe2, 'ã': 0xe3, 'ä': 0xe4,
  'é': 0xe9, 'è': 0xe8, 'ê': 0xea, 'ë': 0xeb,
  'í': 0xed, 'ì': 0xec, 'î': 0xee,
  'ó': 0xf3, 'ò': 0xf2, 'ô': 0xf4, 'õ': 0xf5, 'ö': 0xf6,
  'ú': 0xfa, 'ù': 0xf9, 'û': 0xfb, 'ü': 0xfc,
  'ç': 0xe7, 'ñ': 0xf1,
  'Á': 0xc1, 'À': 0xc0, 'Â': 0xc2, 'Ã': 0xc3,
  'É': 0xc9, 'Ê': 0xca, 'Í': 0xcd, 'Ó': 0xd3, 'Ô': 0xd4, 'Õ': 0xd5,
  'Ú': 0xda, 'Ç': 0xc7,
  '–': 0x96, '—': 0x97, '’': 0x92, '“': 0x93, '”': 0x94,
};

function encodeWin(text) {
  const bytes = [];
  for (const char of String(text)) {
    if (char === '(' || char === ')' || char === '\\') {
      bytes.push(0x5c, char.charCodeAt(0));
      continue;
    }
    const code = char.charCodeAt(0);
    if (code >= 32 && code < 127) bytes.push(code);
    else if (WIN[char] != null) bytes.push(WIN[char]);
    else bytes.push(0x3f);
  }
  return bytes;
}

export function textPdf(lines) {
  const pageSize = 46;
  const pages = [];
  for (let index = 0; index < lines.length; index += pageSize) pages.push(lines.slice(index, index + pageSize));
  if (!pages.length) pages.push(['(vazio)']);
  const objects = [];
  const kids = [];
  pages.forEach((page, pageIndex) => {
    const content = ['BT', '/F1 11 Tf', '48 800 Td', '14 TL'];
    page.forEach((line, lineIndex) => {
      const text = encodeWin(line.slice(0, 95));
      const literal = `(${String.fromCharCode(...text)})`;
      content.push(lineIndex === 0 ? `${literal} Tj` : `T* ${literal} Tj`);
    });
    content.push('ET');
    const stream = content.join('\n');
    const contentId = 3 + pageIndex * 2;
    const pageId = contentId + 1;
    kids.push(`${pageId} 0 R`);
    objects.push(`${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
    objects.push(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`);
  });
  const fontId = 3 + pages.length * 2;
  const body = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>\nendobj\n`,
    ...objects,
    `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
  ].join('');
  let offset = '%PDF-1.4\n'.length;
  const xref = ['0000000000 65535 f \n'];
  const parts = ['%PDF-1.4\n'];
  const chunks = body.split(/(?=\d+ 0 obj)/);
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    parts.push(chunk);
    offset += chunk.length;
  }
  const xrefStart = offset;
  parts.push(`xref\n0 ${xref.length}\n${xref.join('')}trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return parts.join('');
}

export function roadmapLines(track, view) {
  const lines = [`Trilha de Estudos - ${track.name}`, track.description, ''];
  for (const phase of view.phases) {
    lines.push(`Etapa ${phase.number}: ${phase.title}`);
    for (const topic of phase.topics) {
      if (topic.status === 'hidden') continue;
      const mark = topic.done ? '[x]' : '[ ]';
      const extra = topic.status === 'optional' ? ' (opcional)' : '';
      lines.push(`  ${mark} ${topic.title}${extra} - ${topic.hours || 0} h`);
    }
    for (const project of phase.projects || []) {
      lines.push(`  ${project.done ? '[x]' : '[ ]'} Projeto: ${project.title}`);
    }
    lines.push('');
  }
  return lines;
}

export function roadmapMarkdown(track, view) {
  const lines = [`# ${track.name}`, '', track.description, ''];
  for (const phase of view.phases) {
    lines.push(`## Etapa ${phase.number}: ${phase.title}`, '');
    for (const topic of phase.topics) {
      if (topic.status === 'hidden') continue;
      lines.push(`- [${topic.done ? 'x' : ' '}] ${topic.title}${topic.status === 'optional' ? ' _(opcional)_' : ''}`);
    }
    if ((phase.projects || []).length) {
      lines.push('', '### Projetos');
      for (const project of phase.projects) {
        lines.push(`- [${project.done ? 'x' : ' '}] ${project.title} (${project.level})`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function drawRoadmap(canvas, track, view) {
  const width = 1100;
  const rows = view.phases.reduce((sum, phase) => sum + 1 + phase.topics.filter((topic) => topic.status !== 'hidden').length, view.phases.length);
  const height = 180 + rows * 28;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 36px sans-serif';
  ctx.fillText('Trilha de Estudos', 48, 64);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#047857';
  ctx.fillText(track.name, 48, 100);
  let y = 150;
  for (const phase of view.phases) {
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 18px sans-serif';
    ctx.fillText(`Etapa ${phase.number}: ${phase.title}`, 48, y);
    y += 28;
    ctx.font = '16px sans-serif';
    for (const topic of phase.topics) {
      if (topic.status === 'hidden') continue;
      ctx.fillStyle = topic.done ? '#047857' : '#334155';
      const prefix = topic.done ? '✓' : '○';
      const optional = topic.status === 'optional' ? ' · opcional' : '';
      ctx.fillText(`${prefix}  ${topic.title}${optional}`, 72, y);
      y += 26;
    }
    y += 12;
  }
}
