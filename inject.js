const fs = require('fs');
let content = fs.readFileSync('lib/mock-data.ts', 'utf8');

const additional = `
  // Additional Popular POIs for free offline matching
  { id: 'poi1', name: 'โลตัส กระบี่ (Lotus\\'s)', alias: 'Lotus Krabi โลตัสกระบี่', district: 'Mueang Krabi', lng: 98.93885, lat: 8.10923, kind: 'market' },
  { id: 'poi2', name: 'บิ๊กซี กระบี่ (Big C)', alias: 'Big C Krabi บิ๊กซีกระบี่', district: 'Mueang Krabi', lng: 98.93111, lat: 8.10111, kind: 'market' },
  { id: 'poi3', name: 'แม็คโคร กระบี่ (Makro)', alias: 'Makro Krabi แม็คโครกระบี่', district: 'Mueang Krabi', lng: 98.94888, lat: 8.11888, kind: 'market' },
  { id: 'poi4', name: 'โฮมโปร กระบี่ (HomePro)', alias: 'Home Pro Krabi โฮมโปรกระบี่', district: 'Mueang Krabi', lng: 98.9270, lat: 8.1009, kind: 'market' },
  { id: 'poi5', name: 'หาดอ่าวนาง', alias: 'Ao Nang Beach อ่าวนาง', district: 'Mueang Krabi', lng: 98.8188, lat: 8.0305, kind: 'town' },
  { id: 'poi6', name: 'หาดนพรัตน์ธารา', alias: 'Noppharat Thara Beach', district: 'Mueang Krabi', lng: 98.8000, lat: 8.0400, kind: 'town' },
  { id: 'poi7', name: 'วัดถ้ำเสือ', alias: 'Tiger Cave Temple วัดถ้ำเสือ', district: 'Mueang Krabi', lng: 98.9248, lat: 8.1243, kind: 'town' },
  { id: 'poi8', name: 'สระมรกต', alias: 'Emerald Pool สระมรกต', district: 'Khlong Thom', lng: 99.2604, lat: 7.9229, kind: 'town' },
  { id: 'poi9', name: 'น้ำตกร้อน', alias: 'Hot Stream น้ำตกร้อน', district: 'Khlong Thom', lng: 99.2063, lat: 7.9351, kind: 'town' },
  { id: 'poi10', name: 'ศาลากลางจังหวัดกระบี่', alias: 'Krabi City Hall ศาลากลาง', district: 'Mueang Krabi', lng: 98.918, lat: 8.058, kind: 'town' },
];
`;

content = content.replace('];', additional);
fs.writeFileSync('lib/mock-data.ts', content);
