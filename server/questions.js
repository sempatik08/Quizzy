'use strict';

/**
 * Question pool — each category lives in its own file under /questions/.
 * Add a new category by:
 *   1. Creating server/questions/<key>.js that exports { <key>: [...] }
 *   2. Requiring it here and spreading it into QUESTIONS
 *   3. Adding the key to isValidCategory() in server.js
 */

const { general } = require('./questions/general');
const { cinema } = require('./questions/cinema');
const { games } = require('./questions/games');
const { sports } = require('./questions/sports');
const { history } = require('./questions/history');
const { music } = require('./questions/music');

const QUESTIONS = {
  general,
  cinema,
  sports,
  history,
  music,

  anime: [
    {
      id: 'ani_01',
      text: 'Which anime series features the character Naruto Uzumaki, a ninja with a nine-tailed fox sealed inside him?',
      text_tr: 'İçinde dokuz kuyruklu tilki mühürlü olan ninja Naruto Uzumaki\'yi konu alan anime hangisidir?',
      options: { A: 'Bleach', B: 'One Piece', C: 'Naruto', D: 'Dragon Ball Z', E: 'Fairy Tail' },
      options_tr: { A: 'Bleach', B: 'One Piece', C: 'Naruto', D: 'Dragon Ball Z', E: 'Fairy Tail' },
      answer: 'C',
      explanation: 'Naruto, created by Masashi Kishimoto, follows Naruto Uzumaki, who has the Nine-Tails Fox (Kurama) sealed within him.',
    },
    {
      id: 'ani_02',
      text: 'Which Studio Ghibli film features a young girl named Chihiro who gets trapped in a spirit world?',
      text_tr: 'Hangi Studio Ghibli filminde ruhlar dünyasına sıkışan Chihiro adlı genç bir kız anlatılır?',
      options: { A: 'Princess Mononoke', B: 'My Neighbor Totoro', C: 'Nausicaä', D: 'Spirited Away', E: 'Castle in the Sky' },
      options_tr: { A: 'Prenses Mononoke', B: 'Komşum Totoro', C: 'Nausicaä', D: 'Sen Götür Beni', E: 'Gökyüzündeki Kale' },
      answer: 'D',
      explanation: 'Spirited Away (千と千尋の神隠し, 2001) by Hayao Miyazaki follows 10-year-old Chihiro trapped in a spirit realm.',
    },
    {
      id: 'ani_03',
      text: 'In "Attack on Titan," what are the giant humanoid creatures called?',
      text_tr: '"Titans\'a Saldırı"da devasa insansı yaratıklar ne olarak adlandırılır?',
      options: { A: 'Giants', B: 'Colossi', C: 'Titans', D: 'Colossals', E: 'Goliaths' },
      options_tr: { A: 'Devler', B: 'Koloslar', C: 'Titanlar', D: 'Devasa Yaratıklar', E: 'Golyatlar' },
      answer: 'C',
      explanation: 'In Attack on Titan (Shingeki no Kyojin), the giant humanoids threatening humanity are called Titans.',
    },
    {
      id: 'ani_04',
      text: 'Who is the author and creator of the manga "One Piece"?',
      text_tr: '"One Piece" mangasının yaratıcısı kimdir?',
      options: { A: 'Akira Toriyama', B: 'Tite Kubo', C: 'Masashi Kishimoto', D: 'Eiichiro Oda', E: 'Hajime Isayama' },
      options_tr: { A: 'Akira Toriyama', B: 'Tite Kubo', C: 'Masashi Kishimoto', D: 'Eiichiro Oda', E: 'Hajime Isayama' },
      answer: 'D',
      explanation: 'One Piece was created by Eiichiro Oda and has been serialized in Weekly Shōnen Jump since 1997.',
    },
    {
      id: 'ani_05',
      text: 'Which anime is set in a world where people can become heroes or villains with superpowers called "Quirks"?',
      text_tr: '"Quirks" adı verilen süper güçlerle kahramanların veya kötülerin var olduğu dünyada geçen anime hangisidir?',
      options: { A: 'Demon Slayer', B: 'My Hero Academia', C: 'Black Clover', D: 'Hunter x Hunter', E: 'Mob Psycho 100' },
      options_tr: { A: 'İblis Avcısı', B: 'Benim Kahraman Akademim', C: 'Black Clover', D: 'Hunter x Hunter', E: 'Mob Psycho 100' },
      answer: 'B',
      explanation: 'My Hero Academia (Boku no Hero Academia) is set in a world where 80% of the population has superpowers called "Quirks."',
    },
  ],

  games,

  technology: [
    {
      id: 'tec_01',
      text: 'Who co-founded Apple Computer Company in 1976?',
      text_tr: '1976\'da Apple Computer Company\'yi kuranlar kimlerdir?',
      options: { A: 'Bill Gates & Paul Allen', B: 'Steve Jobs, Steve Wozniak & Ronald Wayne', C: 'Steve Jobs & Bill Gates', D: 'Steve Wozniak & Larry Page', E: 'Tim Cook & Steve Jobs' },
      options_tr: { A: 'Bill Gates ve Paul Allen', B: 'Steve Jobs, Steve Wozniak ve Ronald Wayne', C: 'Steve Jobs ve Bill Gates', D: 'Steve Wozniak ve Larry Page', E: 'Tim Cook ve Steve Jobs' },
      answer: 'B',
      explanation: 'Apple was co-founded by Steve Jobs, Steve Wozniak, and Ronald Wayne on April 1, 1976.',
    },
    {
      id: 'tec_02',
      text: 'What does "HTML" stand for?',
      text_tr: '"HTML" kısaltması neyi ifade eder?',
      options: { A: 'Hyper Transfer Markup Language', B: 'HyperText Markup Language', C: 'High-level Text Markup Language', D: 'Hyperlink Text Meta Language', E: 'HyperText Machine Language' },
      options_tr: { A: 'Hiper Transfer İşaretleme Dili', B: 'Hiper Metin İşaretleme Dili', C: 'Yüksek Seviyeli Metin İşaretleme Dili', D: 'Köprü Metni Meta Dili', E: 'Hiper Metin Makine Dili' },
      answer: 'B',
      explanation: 'HTML (HyperText Markup Language) is the standard markup language used to create web pages.',
    },
    {
      id: 'tec_03',
      text: 'In which year was the World Wide Web invented by Tim Berners-Lee?',
      text_tr: 'Tim Berners-Lee tarafından World Wide Web hangi yılda icat edildi?',
      options: { A: '1985', B: '1987', C: '1989', D: '1991', E: '1993' },
      options_tr: { A: '1985', B: '1987', C: '1989', D: '1991', E: '1993' },
      answer: 'C',
      explanation: 'Tim Berners-Lee invented the World Wide Web in 1989 while working at CERN in Switzerland.',
    },
    {
      id: 'tec_04',
      text: 'What is the name of the open-source operating system kernel created by Linus Torvalds in 1991?',
      text_tr: '1991\'de Linus Torvalds tarafından oluşturulan açık kaynaklı işletim sistemi çekirdeğinin adı nedir?',
      options: { A: 'Unix', B: 'FreeBSD', C: 'GNU', D: 'Linux', E: 'Minix' },
      options_tr: { A: 'Unix', B: 'FreeBSD', C: 'GNU', D: 'Linux', E: 'Minix' },
      answer: 'D',
      explanation: 'Linus Torvalds created the Linux kernel in 1991, which now powers the majority of the world\'s servers, smartphones (Android), and supercomputers.',
    },
    {
      id: 'tec_05',
      text: 'Which company developed the Python programming language?',
      text_tr: 'Python programlama dilini kim/hangi kurum geliştirmiştir?',
      options: { A: 'Google', B: 'Microsoft', C: 'Guido van Rossum (personal project)', D: 'MIT', E: 'Sun Microsystems' },
      options_tr: { A: 'Google', B: 'Microsoft', C: 'Guido van Rossum (kişisel proje)', D: 'MIT', E: 'Sun Microsystems' },
      answer: 'C',
      explanation: 'Python was created by Guido van Rossum and first released in 1991. It was not created by a company but by an individual developer.',
    },
  ],

  literature: [
    {
      id: 'lit_01',
      text: 'Who wrote "Don Quixote," often cited as the first modern novel?',
      text_tr: 'Genellikle ilk modern roman olarak gösterilen "Don Kişot"u kim yazmıştır?',
      options: { A: 'Lope de Vega', B: 'Miguel de Cervantes', C: 'Francisco de Quevedo', D: 'Tirso de Molina', E: 'Calderón de la Barca' },
      options_tr: { A: 'Lope de Vega', B: 'Miguel de Cervantes', C: 'Francisco de Quevedo', D: 'Tirso de Molina', E: 'Calderón de la Barca' },
      answer: 'B',
      explanation: 'Miguel de Cervantes wrote Don Quixote (Part I: 1605, Part II: 1615), widely considered the first modern novel.',
    },
    {
      id: 'lit_02',
      text: 'Which Turkish author won the Nobel Prize in Literature in 2006?',
      text_tr: '2006 yılında Nobel Edebiyat Ödülü\'nü kazanan Türk yazar kimdir?',
      options: { A: 'Yaşar Kemal', B: 'Aziz Nesin', C: 'Orhan Pamuk', D: 'Sabahattin Ali', E: 'Ahmet Hamdi Tanpınar' },
      options_tr: { A: 'Yaşar Kemal', B: 'Aziz Nesin', C: 'Orhan Pamuk', D: 'Sabahattin Ali', E: 'Ahmet Hamdi Tanpınar' },
      answer: 'C',
      explanation: 'Orhan Pamuk won the 2006 Nobel Prize in Literature, becoming the first Turkish citizen to win a Nobel Prize.',
    },
    {
      id: 'lit_03',
      text: 'Which Shakespeare play features the characters Hamlet, Ophelia and Horatio?',
      text_tr: 'Hamlet, Ophelia ve Horatio karakterlerinin yer aldığı Shakespeare oyunu hangisidir?',
      options: { A: 'Macbeth', B: 'Othello', C: 'King Lear', D: 'Hamlet', E: 'The Tempest' },
      options_tr: { A: 'Macbeth', B: 'Othello', C: 'Kral Lear', D: 'Hamlet', E: 'Fırtına' },
      answer: 'D',
      explanation: 'Hamlet (c. 1600–1601) is one of Shakespeare\'s greatest tragedies, featuring the Danish prince Hamlet seeking revenge for his father\'s murder.',
    },
    {
      id: 'lit_04',
      text: 'Who wrote "1984," the dystopian novel set in Oceania?',
      text_tr: 'Oceania\'da geçen distopik roman "1984"ü kim yazmıştır?',
      options: { A: 'Aldous Huxley', B: 'Ray Bradbury', C: 'Philip K. Dick', D: 'George Orwell', E: 'H.G. Wells' },
      options_tr: { A: 'Aldous Huxley', B: 'Ray Bradbury', C: 'Philip K. Dick', D: 'George Orwell', E: 'H.G. Wells' },
      answer: 'D',
      explanation: 'George Orwell (Eric Arthur Blair) wrote Nineteen Eighty-Four in 1949, introducing concepts like "Big Brother" and "doublethink."',
    },
    {
      id: 'lit_05',
      text: 'The character "Raskolnikov" appears in which classic Russian novel?',
      text_tr: '"Raskolnikov" karakteri hangi klasik Rus romanında yer alır?',
      options: { A: 'War and Peace', B: 'Anna Karenina', C: 'Crime and Punishment', D: 'The Brothers Karamazov', E: 'The Idiot' },
      options_tr: { A: 'Savaş ve Barış', B: 'Anna Karenina', C: 'Suç ve Ceza', D: 'Karamazov Kardeşler', E: 'Budala' },
      answer: 'C',
      explanation: 'Rodion Raskolnikov is the protagonist of Fyodor Dostoevsky\'s Crime and Punishment (1866).',
    },
  ],

  math: [
    {
      id: 'mat_01',
      text: 'What is the value of π (pi) to five decimal places?',
      text_tr: 'π (pi) sayısının beş ondalık basamağa kadar değeri nedir?',
      options: { A: '3.14149', B: '3.14159', C: '3.14169', D: '3.14179', E: '3.14189' },
      options_tr: { A: '3,14149', B: '3,14159', C: '3,14169', D: '3,14179', E: '3,14189' },
      answer: 'B',
      explanation: 'π ≈ 3.14159 (3.14159265358979…). It is an irrational number representing the ratio of a circle\'s circumference to its diameter.',
    },
    {
      id: 'mat_02',
      text: 'What is the sum of the interior angles of a triangle?',
      text_tr: 'Bir üçgenin iç açılarının toplamı nedir?',
      options: { A: '90°', B: '120°', C: '180°', D: '270°', E: '360°' },
      options_tr: { A: '90°', B: '120°', C: '180°', D: '270°', E: '360°' },
      answer: 'C',
      explanation: 'The sum of interior angles in any Euclidean triangle is always 180°.',
    },
    {
      id: 'mat_03',
      text: 'Which mathematician is credited with formulating the Pythagorean theorem?',
      text_tr: 'Pisagor teoremini geliştiren matematikçi kimdir?',
      options: { A: 'Euclid', B: 'Archimedes', C: 'Thales', D: 'Pythagoras', E: 'Plato' },
      options_tr: { A: 'Euklid', B: 'Arşimet', C: 'Tales', D: 'Pisagor', E: 'Platon' },
      answer: 'D',
      explanation: 'Pythagoras of Samos (c. 570–495 BC) is credited with the theorem a² + b² = c² for right triangles, though it was known earlier in other cultures.',
    },
    {
      id: 'mat_04',
      text: 'What is the result of 0! (zero factorial)?',
      text_tr: '0! (sıfır faktöriyel) işleminin sonucu nedir?',
      options: { A: '0', B: 'Undefined', C: '1', D: '-1', E: 'Infinity' },
      options_tr: { A: '0', B: 'Tanımsız', C: '1', D: '-1', E: 'Sonsuz' },
      answer: 'C',
      explanation: 'By convention and mathematical definition, 0! = 1. This is consistent with the recursive definition n! = n × (n−1)! and combinatorics.',
    },
    {
      id: 'mat_05',
      text: 'Which number system uses only 0 and 1?',
      text_tr: 'Yalnızca 0 ve 1 rakamlarını kullanan sayı sistemi hangisidir?',
      options: { A: 'Decimal', B: 'Hexadecimal', C: 'Octal', D: 'Binary', E: 'Duodecimal' },
      options_tr: { A: 'Onluk', B: 'On altılık', C: 'Sekizlik', D: 'İkilik', E: 'On ikilik' },
      answer: 'D',
      explanation: 'The binary (base-2) number system uses only digits 0 and 1, and is the foundation of all modern digital computing.',
    },
  ],

  geography: [
    {
      id: 'geo_01',
      text: 'Which is the largest country in the world by land area?',
      text_tr: 'Yüzölçümü bakımından dünyanın en büyük ülkesi hangisidir?',
      options: { A: 'Canada', B: 'China', C: 'United States', D: 'Brazil', E: 'Russia' },
      options_tr: { A: 'Kanada', B: 'Çin', C: 'Amerika Birleşik Devletleri', D: 'Brezilya', E: 'Rusya' },
      answer: 'E',
      explanation: 'Russia is the largest country in the world, covering approximately 17.1 million km², which is over twice the size of Canada.',
    },
    {
      id: 'geo_02',
      text: 'What is the capital city of Australia?',
      text_tr: 'Avustralya\'nın başkenti neresidir?',
      options: { A: 'Sydney', B: 'Melbourne', C: 'Brisbane', D: 'Canberra', E: 'Perth' },
      options_tr: { A: 'Sidney', B: 'Melbourne', C: 'Brisbane', D: 'Canberra', E: 'Perth' },
      answer: 'D',
      explanation: 'Canberra is the capital of Australia, chosen as a compromise between Sydney and Melbourne when Australia federated in 1901.',
    },
    {
      id: 'geo_03',
      text: 'Which river is the longest in the world?',
      text_tr: 'Dünyanın en uzun nehri hangisidir?',
      options: { A: 'Amazon', B: 'Yangtze', C: 'Mississippi', D: 'Congo', E: 'Nile' },
      options_tr: { A: 'Amazon', B: 'Yangtze', C: 'Mississippi', D: 'Kongo', E: 'Nil' },
      answer: 'E',
      explanation: 'The Nile River in Africa is generally considered the world\'s longest river at approximately 6,650 km, though some studies suggest the Amazon may be longer.',
    },
    {
      id: 'geo_04',
      text: 'Which mountain range separates Europe from Asia in Russia?',
      text_tr: 'Rusya\'da Avrupa\'yı Asya\'dan ayıran dağ silsilesi hangisidir?',
      options: { A: 'Caucasus Mountains', B: 'Ural Mountains', C: 'Altai Mountains', D: 'Carpathian Mountains', E: 'Zagros Mountains' },
      options_tr: { A: 'Kafkas Dağları', B: 'Ural Dağları', C: 'Altay Dağları', D: 'Karpatlar', E: 'Zagros Dağları' },
      answer: 'B',
      explanation: 'The Ural Mountains form the traditional geographic boundary between Europe and Asia, stretching about 2,500 km through Russia.',
    },
    {
      id: 'geo_05',
      text: 'Which strait separates Europe (Spain) from Africa (Morocco)?',
      text_tr: 'Avrupa\'yı (İspanya) Afrika\'dan (Fas) ayıran boğaz hangisidir?',
      options: { A: 'Strait of Messina', B: 'Strait of Otranto', C: 'Strait of Gibraltar', D: 'Strait of Bosporus', E: 'Strait of Hormuz' },
      options_tr: { A: 'Messina Boğazı', B: 'Otranto Boğazı', C: 'Cebelitarık Boğazı', D: 'İstanbul Boğazı', E: 'Hürmüz Boğazı' },
      answer: 'C',
      explanation: 'The Strait of Gibraltar separates the Iberian Peninsula (Europe) from Morocco (Africa) and connects the Atlantic Ocean to the Mediterranean Sea.',
    },
  ],
};

module.exports = { QUESTIONS };
