-- =============================================================================
-- SpyParty: Seed words_library
-- 把 src/lib/wordUtils.js 裡寫死的詞庫搬到 DB（不再曝露在 client bundle）
-- =============================================================================

insert into public.words_library (id, word_a, word_b) values
  (1,  '{"zh":"警察","en":"Police"}',              '{"zh":"保全","en":"Security Guard"}'),
  (2,  '{"zh":"蘋果","en":"Apple"}',               '{"zh":"番茄","en":"Tomato"}'),
  (3,  '{"zh":"鋼筆","en":"Fountain Pen"}',        '{"zh":"原子筆","en":"Ballpoint Pen"}'),
  (4,  '{"zh":"筆記型電腦","en":"Laptop"}',        '{"zh":"平板電腦","en":"Tablet"}'),
  (5,  '{"zh":"演唱會","en":"Concert"}',           '{"zh":"音樂劇","en":"Musical"}'),
  (6,  '{"zh":"腳踏車","en":"Bicycle"}',           '{"zh":"機車","en":"Motorcycle"}'),
  (7,  '{"zh":"捷運","en":"Subway"}',              '{"zh":"公車","en":"Bus"}'),
  (8,  '{"zh":"咖啡","en":"Coffee"}',              '{"zh":"紅茶","en":"Black Tea"}'),
  (9,  '{"zh":"圖書館","en":"Library"}',           '{"zh":"書店","en":"Bookstore"}'),
  (10, '{"zh":"麥克風","en":"Microphone"}',        '{"zh":"擴音器","en":"Megaphone"}'),
  (11, '{"zh":"護理師","en":"Nurse"}',             '{"zh":"醫師","en":"Doctor"}'),
  (12, '{"zh":"漢堡","en":"Hamburger"}',           '{"zh":"三明治","en":"Sandwich"}'),
  (13, '{"zh":"微波爐","en":"Microwave"}',         '{"zh":"烤箱","en":"Oven"}'),
  (14, '{"zh":"游泳池","en":"Swimming Pool"}',     '{"zh":"海灘","en":"Beach"}'),
  (15, '{"zh":"電影院","en":"Movie Theater"}',     '{"zh":"劇院","en":"Theater"}'),
  (16, '{"zh":"太陽眼鏡","en":"Sunglasses"}',      '{"zh":"近視眼鏡","en":"Prescription Glasses"}'),
  (17, '{"zh":"鑰匙","en":"Key"}',                 '{"zh":"密碼","en":"Password"}'),
  (18, '{"zh":"錢包","en":"Wallet"}',              '{"zh":"存錢筒","en":"Piggy Bank"}'),
  (19, '{"zh":"戒指","en":"Ring"}',                '{"zh":"手環","en":"Bracelet"}'),
  (20, '{"zh":"貓","en":"Cat"}',                   '{"zh":"狗","en":"Dog"}'),
  (21, '{"zh":"鏡子","en":"Mirror"}',              '{"zh":"玻璃","en":"Glass"}'),
  (22, '{"zh":"枕頭","en":"Pillow"}',              '{"zh":"抱枕","en":"Cushion"}'),
  (23, '{"zh":"沐浴乳","en":"Body Wash"}',         '{"zh":"香皂","en":"Soap"}'),
  (24, '{"zh":"牙刷","en":"Toothbrush"}',          '{"zh":"牙線","en":"Dental Floss"}'),
  (25, '{"zh":"衛生紙","en":"Tissue Paper"}',      '{"zh":"濕紙巾","en":"Wet Wipe"}'),
  (26, '{"zh":"筷子","en":"Chopsticks"}',          '{"zh":"叉子","en":"Fork"}'),
  (27, '{"zh":"護照","en":"Passport"}',            '{"zh":"身分證","en":"ID Card"}'),
  (28, '{"zh":"氣球","en":"Balloon"}',             '{"zh":"泡泡","en":"Bubble"}'),
  (29, '{"zh":"巧克力","en":"Chocolate"}',         '{"zh":"糖果","en":"Candy"}'),
  (30, '{"zh":"冰箱","en":"Refrigerator"}',        '{"zh":"冰櫃","en":"Freezer"}')
on conflict (id) do nothing;

-- 重設序列，讓之後手動插入不會撞
select setval('public.words_library_id_seq', (select max(id) from public.words_library));
