// CNTD crawler — extracts document text from docs.cntd.ru
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface CrawlResult {
  text: string;
  title: string;
  sections: { title: string; content: string }[];
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'ru-RU,ru;q=0.9',
};

export async function crawlCntd(url: string): Promise<CrawlResult> {
  console.log(`[cntd] Fetching ${url}`);
  const { data: html } = await axios.get(url, {
    headers: HEADERS,
    timeout: 30000,
  });

  const $ = cheerio.load(html);

  // Remove scripts, styles, nav
  $('script, style, nav, header, footer, .advert, .banner').remove();

  const title = $('h1').first().text().trim() || $('title').text().trim();

  // Main content area
  const contentSelectors = [
    '.document-page__content',
    '.NPA',
    '.content-block',
    '#document-text',
    'article',
    '.main-content',
  ];

  let contentEl = null;
  for (const sel of contentSelectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 200) {
      contentEl = el;
      break;
    }
  }

  if (!contentEl) {
    contentEl = $('body');
  }

  // Extract sections
  const sections: { title: string; content: string }[] = [];
  let currentSection = { title: 'Введение', content: '' };

  contentEl.find('h1, h2, h3, h4, p, table, li, div.text').each((_, el) => {
    const tag = $(el).prop('tagName')?.toLowerCase();
    const text = $(el).text().trim();
    if (!text) return;

    if (tag && ['h1', 'h2', 'h3', 'h4'].includes(tag)) {
      if (currentSection.content.trim()) {
        sections.push({ ...currentSection });
      }
      currentSection = { title: text, content: '' };
    } else if (tag === 'table') {
      // Convert table to text
      const rows: string[] = [];
      $(el).find('tr').each((_, tr) => {
        const cells: string[] = [];
        $(tr).find('td, th').each((_, td) => {
          cells.push($(td).text().trim());
        });
        if (cells.length) rows.push(cells.join(' | '));
      });
      currentSection.content += '\n' + rows.join('\n') + '\n';
    } else {
      currentSection.content += text + '\n';
    }
  });

  if (currentSection.content.trim()) {
    sections.push(currentSection);
  }

  const fullText = sections.map(s => `## ${s.title}\n${s.content}`).join('\n\n');

  console.log(`[cntd] Got ${fullText.length} chars, ${sections.length} sections`);
  return { text: fullText, title, sections };
}
