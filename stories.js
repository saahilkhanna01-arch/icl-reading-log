/* Story library and placement check. Levels follow the UFLI Foundations order; lesson ranges are approximate. */
const LEVELS = [
  { n: 1,  name: "Short a",                 ufli: "1–8",     focus: "a with m, s, t, p, f, n, d, c" },
  { n: 2,  name: "Short i and o",           ufli: "9–20",    focus: "i and o in three-letter words" },
  { n: 3,  name: "Short u and e",           ufli: "21–34",   focus: "all five short vowels" },
  { n: 4,  name: "Double letters and ck",   ufli: "35–38",   focus: "ff, ll, ss, zz, ck" },
  { n: 5,  name: "sh, th, ch, wh",          ufli: "39–45",   focus: "two letters, one sound" },
  { n: 6,  name: "Blends, ng and nk",       ufli: "46–53",   focus: "st, fr, gr, pl, -ng, -nk" },
  { n: 7,  name: "Silent e",                ufli: "54–62",   focus: "a_e, i_e, o_e, u_e" },
  { n: 8,  name: "Endings -s, -ed, -ing",   ufli: "63–76",   focus: "adding endings to known words" },
  { n: 9,  name: "ar, or, er, ir, ur",      ufli: "77–83",   focus: "r-controlled vowels" },
  { n: 10, name: "ai, ay, ee, ea, oa, ow",  ufli: "84–91",   focus: "long vowel teams" },
  { n: 11, name: "oo, ou, ow, oi, oy, aw",  ufli: "92–106",  focus: "other vowel teams" },
  { n: 12, name: "Longer words",            ufli: "107–128", focus: "two and three syllables, prefixes, suffixes" },
];

const STORIES = [
  // Level 1
  { id: "1a", level: 1, title: "The Fat Cat", tricky: ["the", "is", "on", "has"],
    text: "Dad has a cat. The cat is fat. The fat cat sat on a mat. The cat had a nap on the mat. Sam ran at the cat. The cat ran! Sam sat on the mat. Sam had a nap." },
  { id: "1b", level: 1, title: "The Tan Van", tricky: ["the", "in", "has"],
    text: "Dad has a tan van. Sam and Nan sat in the van. Dad had a map. Can Nan tap the map? Nan can! Nan can tap the map. Dad ran the van. The van ran fast." },
  { id: "1c", level: 1, title: "Pam Can", tricky: ["the", "has"],
    text: "Pam has a pan. Pam has a fan. Can Pam fan the pan? Pam can! Dad can pat the cat. Sam can tap a can. Tap, tap, tap! Nan can nap. Pam, Dad, Sam and Nan sat. Ha, ha, ha!" },
  // Level 2
  { id: "2a", level: 2, title: "The Big Pig", tricky: ["the", "is"],
    text: "Tim has a big pig. The pig is in a pit. The pig can dig. Dig, dig, dig! The big pig got a fig. Tim got a mop. Tim did mop the pig. The pig is not hot. It is a fit pig!" },
  { id: "2b", level: 2, title: "Hop on the Log", tricky: ["Ali", "the", "on"],
    text: "Ali has a dog. The dog can hop. Hop, hop, hop! The dog hops on a log. Ali sits on the log. The dog is on top. Ali and the dog sit in the hot sun. The dog naps. Ali naps." },
  { id: "2c", level: 2, title: "The Hot Pot", tricky: ["the", "do", "put"],
    text: "Mom has a pot. The pot is hot. Do not tip the pot! Sid did not tip it. Sid got a lid. Sid put the lid on the pot. Mom and Sid sit. The pot is hot, hot, hot." },
  // Level 3
  { id: "3a", level: 3, title: "Ben on the Bus", tricky: ["the", "went", "had"],
    text: "Ben got on a bus. The bus is red. It is hot on the bus. Ben sat next to Meg. The bus hit a big bump. Up went Ben! Up went Meg! Ben and Meg had fun on the bus." },
  { id: "3b", level: 3, title: "The Red Hen", tricky: ["the", "was", "to"],
    text: "Pam has a red hen. The hen sat in a box. Pam fed the hen a bun. The hen sat and sat. The hen got up. In the box was an egg! Pam ran to get Mum. Yes, it is an egg!" },
  { id: "3c", level: 3, title: "Fun in the Sun", tricky: ["Gul", "the", "to"],
    text: "It is a hot sun. Kids run and run. Gul has a bat. Rob has a net. Gul hit it! Up, up, up it went. Rob got it in his net. Yes! It is fun to run in the sun." },
  // Level 4
  { id: "4a", level: 4, title: "Jack and the Duck", tricky: ["the", "to", "will"],
    text: "Jack has a duck. The duck is in the mud. Quack! The duck will not get up. Jack gets a stick. Tick, tick on a rock. The duck gets up and runs back to Jack. Jack can pick up the duck." },
  { id: "4b", level: 4, title: "Up the Hill", tricky: ["Bilal", "his", "said", "the"],
    text: "Bilal and his cat go up the hill. It is a big hill. Bilal will not miss the top! The cat sits on a rock. Puff, puff, said Bilal. At last, Bilal is at the top. The cat is still on the rock!" },
  { id: "4c", level: 4, title: "Kick and Pass", tricky: ["the", "of", "lots"],
    text: "Zack can kick. Kick, kick, kick! Zack kicks the ball up the hill. It hits a rock and gets stuck. Zack picks it up. Then Zack and Mick pass it back and fill the day with fun. Kick and pass is lots of fun." },
  // Level 5
  { id: "5a", level: 5, title: "The Red Ship", tricky: ["the", "of", "water"],
    text: "Shan has a red ship. Shan sets the ship in a tub of water. Splash! The ship can rock, but it will not sink. Then a chick hops in! The chick sits on the ship. Shan laughs. Which one is the captain now?" },
  { id: "5b", level: 5, title: "Lunch on the Bench", tricky: ["the", "was", "have", "I"],
    text: "It is lunch on the bench. Mom has fish. Dad has chicken. I have chips. Which is the best? I think it is the fish! Then we munch and munch. That was such a fun lunch." },
  { id: "5c", level: 5, title: "Thick and Thin", tricky: ["the", "with", "both"],
    text: "This is a thin stick. That is a thick stick. Which stick will Seth pick? Seth picks the thick stick. With it, Seth digs a ditch. Then Dad gets the thin stick. Dad fixes the shed with it. Thick or thin, both sticks help." },
  // Level 6
  { id: "6a", level: 6, title: "The Frog Song", tricky: ["the", "went", "down"],
    text: "Frank went to the pond. The pond had fish and frogs. Frank sang a song. A frog sat on a plank and sang back! Ribbit, sang the frog. Frank and the frog sang and sang. At last the sun went down." },
  { id: "6b", level: 6, title: "Ring the Bell", tricky: ["Hamid", "Sana", "they", "the"],
    text: "Ding, dong! Ring the bell. Class is on! Hamid and Sana run in fast. They sit at a desk. Hamid has a pink pen. Sana has a black pen. The class must think and think. Then Hamid and Sana get a gold star!" },
  { id: "6c", level: 6, title: "Gran's Trunk", tricky: ["what", "my", "says", "the"],
    text: "Gran has a big trunk. What is in it? Hamid lifts the lid. In the trunk is a quilt, a drum and a blanket. Hamid gets the drum. Bang, bang, bang! Gran grins. That drum was my dad's, she says." },
  // Level 7
  { id: "7a", level: 7, title: "The White Kite", tricky: ["Zain", "goes", "the"],
    text: "Zain has a white kite. It has a red stripe. Zain runs and the kite rides up. It goes up, up, up, past the trees. Then the wind stops. The kite drops! Zain must race to save it. Zain grabs the line just in time." },
  { id: "7b", level: 7, title: "Rose Bakes a Cake", tricky: ["she", "for", "they", "says"],
    text: "Rose will bake a cake. She makes it with care. Then she places the cake on a plate. Can I take a bite? asks Mike. Not yet! says Rose. This cake is for Mom. Mom comes home and smiles. They all share the cake." },
  { id: "7c", level: 7, title: "A Fine Ride", tricky: ["Sami", "Abbu", "they", "was"],
    text: "Sami and Abbu ride the bike to the shop. It is a long ride. They pass a cave, a lake and a pine tree. At the shop, Abbu gets rice and a lime. Then they ride home. Sami smiles. That was a fine ride!" },
  // Level 8
  { id: "8a", level: 8, title: "Playing Tag", tricky: ["Asif", "Rafi", "they", "are"],
    text: "Asif is jumping. Rafi is running. They are playing tag. Asif jumped on a rock. Rafi rushed past him. Asif tagged Rafi on the back! You are it, yelled Asif. Rafi spun and chased him. They kept playing until lunch." },
  { id: "8b", level: 8, title: "The Missing Lamb", tricky: ["Ali", "heard", "where", "was"],
    text: "Dad's lamb was missing. Ali looked and looked. He checked the shed. He checked the hills. Then Ali heard a little bleat. The lamb was resting in the grass by the well. Ali picked it up and carried it home." },
  { id: "8c", level: 8, title: "Helping Mom", tricky: ["Saba", "you", "so", "much"],
    text: "Saba is helping Mom. Mom is cooking lunch. Saba fetched the pots. She washed the dishes. She rinsed the cups and stacked them. Mom smiled. You helped so much! Saba grinned. Helping is the best." },
  // Level 9
  { id: "9a", level: 9, title: "Arif's Farm", tricky: ["Arif", "there", "are", "morning"],
    text: "Arif lives on a farm. The farm has a barn. In the barn there are hens, a horse and a big cart. In the morning, Arif feeds the hens. Then he brushes the horse. Farm work is hard, but Arif is strong." },
  { id: "9b", level: 9, title: "The Storm", tricky: ["Nur", "her", "mother", "said"],
    text: "The sky got dark. A storm was coming! Nur and her sister ran to the porch. Hurry, said Nur's mother. The thunder roared. The birds were quiet. Nur curled up next to her sister until the storm was over." },
  { id: "9c", level: 9, title: "A Shirt for Eid", tricky: ["Kamran", "Eid", "new", "wear"],
    text: "Kamran got a new shirt for Eid. It is a dark red shirt with a short collar. Kamran wore it to the market. His friends said it was the best shirt. Kamran felt like a star. He will wear it again next Eid." },
  // Level 10
  { id: "10a", level: 10, title: "Rain on the Way", tricky: ["Aisha", "Bilal", "the", "out"],
    text: "It is a gray day. Rain is on the way. Aisha and Bilal wait under the tree. Drip, drip. The rain falls on the leaves. Then the sun peeks out. Aisha sees a rainbow! Bilal and Aisha play in the sun again." },
  { id: "10b", level: 10, title: "Our Goat", tricky: ["our", "named", "the", "always"],
    text: "Our goat is named Snow. Snow has a white coat. Each morning, Snow eats green leaves by the road. Snow likes to roam, so we keep her on a rope. When we are slow, Snow will bleat. Snow is always ready to eat!" },
  { id: "10c", level: 10, title: "The Green Tree", tricky: ["Rahim", "seed", "the", "grew"],
    text: "Rahim planted a seed by the road. Each day he gave it water. Weeks went by. Then a green leaf came up. Rahim was so pleased! The seed grew and grew. Now it is a tall tree, and Rahim reads in its shade." },
  // Level 11
  { id: "11a", level: 11, title: "The Brown Cow", tricky: ["the", "out", "loud", "would"],
    text: "We have a brown cow. Each day she walks out to the field. She chews the soft grass and lies down in the shade. At noon, the cow moos very loud. That means she wants to go home. The cow is my good friend." },
  { id: "11b", level: 11, title: "The Moon", tricky: ["Fatima", "the", "moon", "looks"],
    text: "At night, Fatima looks up at the moon. The moon is round and bright. Soon, a cloud floats past and the moon is hidden. Fatima waits. Then the moon shows its face again. Fatima smiles and points. There it is!" },
  { id: "11c", level: 11, title: "The Toy Box", tricky: ["Yusuf", "the", "brought", "favorite"],
    text: "Yusuf has a toy box. In it is a ball, a kite and a little drum. His cousin Joy came to play. Joy saw the toy box and shouted with joy. Yusuf let her choose first. She chose the drum. They played until the sun went down." },
  // Level 12
  { id: "12a", level: 12, title: "The Cricket Match", tricky: ["cricket", "village", "team", "everyone"],
    text: "On Friday, our village had a cricket match. Our team batted first. Hamza hit the ball over the wall for six runs! Everyone cheered. The other team tried their best, but we won by ten runs. After the match, we shared sweets and talked about every shot." },
  { id: "12b", level: 12, title: "Planting Together", tricky: ["vegetables", "carefully", "beautiful"],
    text: "In spring, my family plants vegetables. My father digs the soil and my mother carefully places each seed. My little brother waters the rows. In a few weeks, small green plants appear. By summer, we have tomatoes, peppers and onions. Our garden is beautiful and useful." },
  { id: "12c", level: 12, title: "A Class on the Computer", tricky: ["computer", "Canada", "teacher", "different"],
    text: "Every Sunday, I have a reading class on the computer. My teacher lives in Canada, which is very far away. When it is morning for her, it is evening for me. We read stories together, and she helps me with difficult words. I am getting better every week." },
];

/* Placement check, our own, inspired by DIBELS: letter sounds, made-up words, a short passage. */
const PLACEMENT = {
  letters: "m a s t p f i n o d c u g b e h r l k w j y v x z q t s m a d n i p o f c e u g r b l h".split(" "),
  bands: [
    { level: 2,  label: "Short vowels",        words: ["zat", "mip", "fot", "lun", "ped"] },
    { level: 4,  label: "sh, th, ch, blends",  words: ["shom", "thip", "chab", "flet", "grum"] },
    { level: 7,  label: "Silent e",            words: ["bame", "tipe", "rofe", "mune", "zade"] },
    { level: 9,  label: "Vowel teams and r",   words: ["feep", "goam", "tair", "sork", "lurt"] },
  ],
  passage: { title: "The Market", text: "On Saturday, Sana went to the market with her mother. The market was busy and loud. They bought rice, eggs and six red apples. Sana saw a man selling bright kites. She asked her mother if she could have one. Her mother smiled and said yes. On the way home, Sana held the kite high in the wind. It was the best day of the week." },
};
