// Priority normative documents for construction (НВФ, СПК, алюминий)
export interface SeedDocument {
  source: 'cntd' | 'gost' | 'minstroy';
  code: string;
  title: string;
  url: string;
  category: 'НВФ' | 'СПК' | 'алюминий' | 'общее';
  doc_type: 'СП' | 'ГОСТ' | 'СТО' | 'СНиП' | 'МДС' | 'ТР';
}

export const SEED_DOCUMENTS: SeedDocument[] = [
  // НВФ (навесные вентилируемые фасады)
  {
    source: 'cntd',
    code: 'СП 28.13330.2017',
    title: 'Защита строительных конструкций от коррозии',
    url: 'https://docs.cntd.ru/document/456069587',
    category: 'НВФ',
    doc_type: 'СП',
  },
  {
    source: 'cntd',
    code: 'СТО НОСТРОЙ 2.14.67-2012',
    title: 'Навесные фасадные системы с воздушным зазором. Монтаж',
    url: 'https://docs.cntd.ru/document/1200097087',
    category: 'НВФ',
    doc_type: 'СТО',
  },
  {
    source: 'cntd',
    code: 'СП 50.13330.2012',
    title: 'Тепловая защита зданий',
    url: 'https://docs.cntd.ru/document/1200095525',
    category: 'НВФ',
    doc_type: 'СП',
  },
  {
    source: 'cntd',
    code: 'ГОСТ 31937-2024',
    title: 'Здания и сооружения. Правила обследования и мониторинга',
    url: 'https://docs.cntd.ru/document/1200024393',
    category: 'НВФ',
    doc_type: 'ГОСТ',
  },
  {
    source: 'cntd',
    code: 'СП 70.13330.2012',
    title: 'Несущие и ограждающие конструкции',
    url: 'https://docs.cntd.ru/document/1200097518',
    category: 'НВФ',
    doc_type: 'СП',
  },

  // СПК (светопрозрачные конструкции)
  {
    source: 'cntd',
    code: 'ГОСТ 11214-2003',
    title: 'Блоки оконные деревянные с листовым остеклением',
    url: 'https://docs.cntd.ru/document/1200034064',
    category: 'СПК',
    doc_type: 'ГОСТ',
  },
  {
    source: 'cntd',
    code: 'ГОСТ 30674-99',
    title: 'Блоки оконные из ПВХ профилей',
    url: 'https://docs.cntd.ru/document/1200005589',
    category: 'СПК',
    doc_type: 'ГОСТ',
  },
  {
    source: 'cntd',
    code: 'ГОСТ 21519-2003',
    title: 'Блоки оконные из алюминиевых сплавов',
    url: 'https://docs.cntd.ru/document/1200034065',
    category: 'СПК',
    doc_type: 'ГОСТ',
  },
  {
    source: 'cntd',
    code: 'ГОСТ 24866-2014',
    title: 'Стеклопакеты клееные',
    url: 'https://docs.cntd.ru/document/1200113341',
    category: 'СПК',
    doc_type: 'ГОСТ',
  },
  {
    source: 'cntd',
    code: 'СП 23-101-2004',
    title: 'Проектирование тепловой защиты зданий',
    url: 'https://docs.cntd.ru/document/1200035109',
    category: 'СПК',
    doc_type: 'СП',
  },

  // Алюминий
  {
    source: 'cntd',
    code: 'ГОСТ 22233-2018',
    title: 'Профили прессованные из алюминиевых сплавов для ограждающих конструкций',
    url: 'https://docs.cntd.ru/document/1200160575',
    category: 'алюминий',
    doc_type: 'ГОСТ',
  },
  {
    source: 'cntd',
    code: 'ГОСТ 4784-2019',
    title: 'Алюминий и сплавы алюминиевые деформируемые. Марки',
    url: 'https://docs.cntd.ru/document/1200168639',
    category: 'алюминий',
    doc_type: 'ГОСТ',
  },
  {
    source: 'cntd',
    code: 'ГОСТ 9.301-86',
    title: 'Покрытия металлические и неметаллические неорганические',
    url: 'https://docs.cntd.ru/document/1200003592',
    category: 'алюминий',
    doc_type: 'ГОСТ',
  },

  // Общее (строительство)
  {
    source: 'cntd',
    code: 'СП 48.13330.2019',
    title: 'Организация строительства',
    url: 'https://docs.cntd.ru/document/564403830',
    category: 'общее',
    doc_type: 'СП',
  },
  {
    source: 'cntd',
    code: 'СП 246.1325800.2016',
    title: 'Положение об авторском надзоре',
    url: 'https://docs.cntd.ru/document/456054198',
    category: 'общее',
    doc_type: 'СП',
  },
  {
    source: 'cntd',
    code: 'СНиП 12-03-2001',
    title: 'Безопасность труда в строительстве. Часть 1',
    url: 'https://docs.cntd.ru/document/901794520',
    category: 'общее',
    doc_type: 'СНиП',
  },
  {
    source: 'cntd',
    code: 'СНиП 12-04-2002',
    title: 'Безопасность труда в строительстве. Часть 2',
    url: 'https://docs.cntd.ru/document/901831804',
    category: 'общее',
    doc_type: 'СНиП',
  },
  {
    source: 'cntd',
    code: 'МДС 12-29.2006',
    title: 'Методические рекомендации по разработке ППР',
    url: 'https://docs.cntd.ru/document/1200048390',
    category: 'общее',
    doc_type: 'МДС',
  },
  {
    source: 'cntd',
    code: 'ГОСТ Р 56926-2016',
    title: 'Конструкции фасадные навесные вентилируемые. Общие технические условия',
    url: 'https://docs.cntd.ru/document/1200133236',
    category: 'НВФ',
    doc_type: 'ГОСТ',
  },
  {
    source: 'cntd',
    code: 'ТР 161-05',
    title: 'Технические рекомендации по проектированию и монтажу НВФ',
    url: 'https://docs.cntd.ru/document/1200043539',
    category: 'НВФ',
    doc_type: 'ТР',
  },
];
