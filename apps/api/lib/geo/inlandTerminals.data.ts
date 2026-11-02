// Inland terminals (dry ports, rail and intermodal terminals), one per line:
// CODE|Terminal name|Town|Country code|Kind|Railroads. None has an official code, so the code is the
// app's own: the country, the source and a number - DP for the dry ports of international importance
// (UNESCAP, Annex I), numbered in country and name order; IT for intermodal-terminals.eu, by that
// site's terminal id; RR for US rail intermodal terminals, numbered in state, city and name order.
// Kind: D dry port, T intermodal terminal, R rail terminal. From
// Worldwide_CY_Ocean_and_Inland_Terminals_2026-11-02.xlsx. Regenerate from a fresh workbook
// rather than editing by hand; codes numbered in order can shift when the lists change.
export const INLAND_TERMINALS_DATA = `
AF-DP001|Haqueena, Mimana|Mimana|AF|D|
AF-DP002|Heiratan Dry Port, Mazar-e-Sharif|Mazar-e-Sharif|AF|D|
AF-DP003|Islam Qala, Herat|Herat|AF|D|
AF-DP004|Kabul Dry Port|Kabul|AF|D|
AF-DP005|Shirkhan Bander Dry Port, Kondoz|Kondoz|AF|D|
AF-DP006|Speenboldake Chaman Dry Port, Kandahar|Kandahar|AF|D|
AF-DP007|Torkham Dry Port, Jalalabad|Jalalabad|AF|D|
AF-DP008|Turghundi, Herat|Herat|AF|D|
AM-DP009|Akhuryan Logistic Center||AM|D|
AM-DP010|Gyumri Airport||AM|D|
AM-DP011|Karmir Blur/ Apaven Cargo Terminal||AM|D|
AM-DP012|Zvartnots International Logistic Center||AM|D|
AZ-DP013|Baku Cargo Terminal of Heydar Aliyev International Airport|Baku|AZ|D|
AZ-DP014|Baku City Goods Depot, Khirdalan Station|Khirdalan Station|AZ|D|
AZ-DP015|Balakan Cargo Terminal, Azerbaijan-Georgia border|Azerbaijan-Georgia border|AZ|D|
AZ-DP016|Bilasuvar Cargo Terminal, Azerbaijan-Islamic Republic of Iran border|Azerbaijan-Islamic Republic of Iran border|AZ|D|
AZ-DP017|Cargo Terminal on frontier point at state border, Samur|Samur|AZ|D|
AZ-DP018|Cargo Terminal on frontier point at state border, Sinig-Korpu|Sinig-Korpu|AZ|D|
AZ-DP019|Container Terminal of Baku International Sea Trade Port|Baku|AZ|D|
AZ-DP020|Gabala International Airport|Gabala|AZ|D|
AZ-DP021|Ganja International Airport|Ganja|AZ|D|
AZ-DP022|Ganja Station|Ganja|AZ|D|
AZ-DP023|Heydar Aliyev International Airport, Baku|Baku|AZ|D|
AZ-DP024|International Logistics Centre, Alyat|Alyat|AZ|D|
AZ-DP025|Julfa Cargo Terminal, Azerbaijan-Islamic Republic of Iran border|Azerbaijan-Islamic Republic of Iran border|AZ|D|
AZ-DP026|Keshla Station, Baku|Baku|AZ|D|
AZ-DP027|Lenkoran International Airport|Lenkoran|AZ|D|
AZ-DP028|Nakhichevan International Airport, Autonomous Republic of Nakhichevan|Autonomous Republic of Nakhichevan|AZ|D|
AZ-DP029|New Baku International Sea Trade Port, Alyat|Alyat|AZ|D|
AZ-DP030|Silk Way Cargo Terminal, Baku|Baku|AZ|D|
AZ-DP031|South Terminal on frontier point at state border (Astara)||AZ|D|
AZ-DP032|Sumgait Station|Sumgait|AZ|D|
AZ-DP033|Zagatala International Airport|Zagatala|AZ|D|
BD-DP034|Akhaura, Brahmanbaria|Brahmanbaria|BD|D|
BD-DP035|Bangladbandh, Panchagargh|Panchagargh|BD|D|
BD-DP036|Benapole, Jessore|Jessore|BD|D|
BD-DP037|Bhomra, Satkhira|Satkhira|BD|D|
BD-DP038|Bibirbazar, Comilla|Comilla|BD|D|
BD-DP039|Bilonia, Feni|Feni|BD|D|
BD-DP040|Burimari, Lalmonirhat|Lalmonirhat|BD|D|
BD-DP041|Dhirasram ICD, Gajipur|Gajipur|BD|D|
BD-DP042|Gobrakura, Mymensingh|Mymensingh|BD|D|
BD-DP043|Hili, Dinajpur|Dinajpur|BD|D|
BD-DP044|Kamlapur ICD, Dhaka|Dhaka|BD|D|
BD-DP045|Koraitali, Mymensigh|Mymensigh|BD|D|
BD-DP046|Nakugao, Sherpur|Sherpur|BD|D|
BD-DP047|Ramgarh, Khagrachari|Khagrachari|BD|D|
BD-DP048|Sonamasjid, Chapai Nawabganj|Chapai Nawabganj|BD|D|
BD-DP049|Tamabil, Sylhet|Sylhet|BD|D|
BD-DP050|Teknaf, Cox's Bazar|Cox's Bazar|BD|D|
BT-DP051|Gelephu, Sarpang|Sarpang|BT|D|
BT-DP052|Gomtu, Samtse|Samtse|BT|D|
BT-DP053|Nganglam, Samdrupjongkhar|Samdrupjongkhar|BT|D|
BT-DP054|Phuentsholing Dry Port|Phuentsholing|BT|D|
BT-DP055|Samdrupjongkhar|Samdrupjongkhar|BT|D|
BT-DP056|Samtse|Samtse|BT|D|
CN-DP057|Changchun Xinglong Bonded International Logistics Port|Changchun|CN|D|
CN-DP058|Erenhot South International Logistics Center|Erenhot|CN|D|
CN-DP059|Harbin Highway Freight Hub Station (Harbin Longyun Logistics Park)|Harbin|CN|D|
CN-DP060|Hekou Port Transport Logistics Park|Hekou|CN|D|
CN-DP061|Horgos International Logistics Park|Horgos|CN|D|
CN-DP062|Hunchun International Logistics Park, Humchun|Humchun|CN|D|
CN-DP063|Jinghong Mengyang International Logistics Trading Center|Jinghong|CN|D|
CN-DP064|Kashi International Logistics Park|Kashi|CN|D|
CN-DP065|Manzhouli New International Freight Yard|Manzhouli|CN|D|
CN-DP066|Nanning Bonded Logistics Center|Nanning|CN|D|
CN-DP067|Pingxiang Border Trade Logistics Center, Pingxiang (Youyi Guan)|Pingxiang (Youyi Guan)|CN|D|
CN-DP068|Ruili Cargo Centre|Ruili|CN|D|
CN-DP069|Suifenhe Cargo Centre|Suifenhe|CN|D|
CN-DP070|Tengjun International Land Port, Kunming|Kunming|CN|D|
CN-DP071|Xinjiang Railway International Logistics Park, Urumqi|Urumqi|CN|D|
CN-DP072|Yiwu Inland Port Station|Yiwu|CN|D|
CN-DP073|Zhangmu Port Warehouse Logistics Trading Center|Zhangmu|CN|D|
GE-DP074|Poti Free Industrial Zone|Poti|GE|D|
GE-DP075|Tbilisi International Logistics Centre|Tbilisi|GE|D|
ID-DP076|Cikarang Dry Port, Bekasi|Bekasi|ID|D|
ID-DP077|Gedebage Dry Port, Bandung|Bandung|ID|D|
IN-DP078|Ajni, Nagpur, Maharashtra|Nagpur, Maharashtra|IN|D|
IN-DP079|Amingaon, Guwahati, Assam|Guwahati, Assam|IN|D|
IN-DP080|Aroor, Kerala|Kerala|IN|D|
IN-DP081|Ballabhgarh, Faridabad, Haryana|Faridabad, Haryana|IN|D|
IN-DP082|Bhadohi, Sant Ravidas Nagar, Varanasi, Uttar Pradesh|Sant Ravidas Nagar, Varanasi, Uttar Pradesh|IN|D|
IN-DP083|Bhagat Ki Kothi, Jodhpur, Rajasthan|Jodhpur, Rajasthan|IN|D|
IN-DP084|Chehreta, Amritsar, Punjab|Amritsar, Punjab|IN|D|
IN-DP085|CPL, Dadri, Uttar Pradesh|Dadri, Uttar Pradesh|IN|D|
IN-DP086|Dadri, Noida, Uttar Pradesh|Noida, Uttar Pradesh|IN|D|
IN-DP087|Daulatabad, Aurangabad, Maharashtra|Aurangabad, Maharashtra|IN|D|
IN-DP088|Dhandarikalan, Punjab|Punjab|IN|D|
IN-DP089|Dhannad Rau, Indore, Madhya Pradesh|Indore, Madhya Pradesh|IN|D|
IN-DP090|Dronagiri Node, Navi Mumbai, Maharashtra|Navi Mumbai, Maharashtra|IN|D|
IN-DP091|Durgapur, West Bengal|West Bengal|IN|D|
IN-DP092|Garhi Harsaru, Gurgaon, Haryana|Gurgaon, Haryana|IN|D|
IN-DP093|ICD, Patparganj|Patparganj|IN|D|
IN-DP094|ICD, Sabarmati, Ahmedabad|Sabarmati, Ahmedabad|IN|D|
IN-DP095|ICD, Sonepat, Haryana|Sonepat, Haryana|IN|D|
IN-DP096|ICD, Sriperumbudur, Tamil Nadu|Sriperumbudur, Tamil Nadu|IN|D|
IN-DP097|ICD, Thar, Ahmedabad|Thar, Ahmedabad|IN|D|
IN-DP098|ICD, Umbergaon, Maharashtra|Umbergaon, Maharashtra|IN|D|
IN-DP099|Irugur, Coimbatore, Tamil Nadu|Coimbatore, Tamil Nadu|IN|D|
IN-DP100|Jamshedpur, Jharkhand|Jharkhand|IN|D|
IN-DP101|Janory, Nasik, Maharashtra|Nasik, Maharashtra|IN|D|
IN-DP102|Kanakpura, Jaipur, Rajasthan|Jaipur, Rajasthan|IN|D|
IN-DP103|Kanpur, Uttar Pradesh|Uttar Pradesh|IN|D|
IN-DP104|Khodiyar, Gujarat|Gujarat|IN|D|
IN-DP105|Loni, Ghaziabad, Uttar Pradesh|Ghaziabad, Uttar Pradesh|IN|D|
IN-DP106|Majerhat, Kolkata, West Bengal|Kolkata, West Bengal|IN|D|
IN-DP107|Mandideep, Bhopal, Madhya Pradesh|Bhopal, Madhya Pradesh|IN|D|
IN-DP108|Moradabad, Uttar Pradesh|Uttar Pradesh|IN|D|
IN-DP109|Patli, Gurgaon, Haryana|Gurgaon, Haryana|IN|D|
IN-DP110|Pithampur, Dhar, Madhya Pradesh|Dhar, Madhya Pradesh|IN|D|
IN-DP111|Raipur, Chhattisgarh|Chhattisgarh|IN|D|
IN-DP112|Sachin, Surat, Gujarat|Surat, Gujarat|IN|D|
IN-DP113|Sanath Nagar, Hyderabad, Andhra Pradesh|Hyderabad, Andhra Pradesh|IN|D|
IN-DP114|Senewal, Ludhiana, Punjab|Ludhiana, Punjab|IN|D|
IN-DP115|Tondiarpet, Chennai, Tamil Nadu|Chennai, Tamil Nadu|IN|D|
IN-DP116|Tughlakabad, Delhi|Delhi|IN|D|
IN-DP117|Vadodara, Gujarat|Gujarat|IN|D|
IN-DP118|Whitefield, Bangalore, Karnataka|Bangalore, Karnataka|IN|D|
IR-DP119|Arvand Free Industrial Zone, Khozestan Province|Khozestan Province|IR|D|
IR-DP120|Imam Khomeini International Airport, Tehran Province|Tehran Province|IR|D|
IR-DP121|Motahari Rail Station, Mashhad, Khorasan Razavi Province|Mashhad, Khorasan Razavi Province|IR|D|
IR-DP122|Sahlan Special Economic Zone, Tabriz, East Azerbaijan Province|Tabriz, East Azerbaijan Province|IR|D|
IR-DP123|Salafchegan Special Economic Zone, Qom Province|Qom Province|IR|D|
IR-DP124|Sarakhs Special Economic Zone, Khorasan Razavi Province|Khorasan Razavi Province|IR|D|
IR-DP125|Shahid Dastgheyb International Airport, Shiraz, Fars Province|Shiraz, Fars Province|IR|D|
IR-DP126|Sirjan Special Economic Zone, Kerman Province|Kerman Province|IR|D|
IR-DP127|Zahedan Logistics Centre, Sistan and Bakluchestan Province|Sistan and Bakluchestan Province|IR|D|
KG-DP128|Alamedin, Bishkek|Bishkek|KG|D|
KG-DP129|Osh|Osh|KG|D|
KH-DP130|CWT Dry Port, Phnom Penh|Phnom Penh|KH|D|
KH-DP131|Olair World Wide Dry Port, Phnom Penh|Phnom Penh|KH|D|
KH-DP132|Phnom Penh International Port|Phnom Penh|KH|D|
KH-DP133|Phnom Penh Special Economic Zone|Phnom Penh|KH|D|
KH-DP134|So Nguon Dry Port, Bavet|Bavet|KH|D|
KH-DP135|Tech Srun Dry Port, Phnom Penh|Phnom Penh|KH|D|
KH-DP136|Teng Lay Dry Port, Phnom Penh|Phnom Penh|KH|D|
KR-DP137|Uiwang ICD|Uiwang|KR|D|
KZ-DP138|Astyk Logistics, Nur-Sultan|Nur-Sultan|KZ|D|
KZ-DP139|Continental Logistics Shymkent Transport and Logistics Centre|Shymkent|KZ|D|
KZ-DP140|Continental Logistics Transport and Logistics Centre, Nur-Sultan|Nur-Sultan|KZ|D|
KZ-DP141|KTZE-Khorgos Gateway Dry Port, Almaty Region|Almaty Region|KZ|D|
LA-DP142|Houyxai, Bokeo|Bokeo|LA|D|
LA-DP143|Laksao, Borikhamsai|Borikhamsai|LA|D|
LA-DP144|Luangprabang|Luangprabang|LA|D|
LA-DP145|Nateuy, Luangnamtha|Luangnamtha|LA|D|
LA-DP146|Oudomsai, Muangxai|Muangxai|LA|D|
LA-DP147|Pakse, Champasack|Champasack|LA|D|
LA-DP148|Seno, Savanakhet|Savanakhet|LA|D|
LA-DP149|Thakhek, Khammouane|Khammouane|LA|D|
LA-DP150|Thanaleng, Vientiane|Vientiane|LA|D|
LK-DP151|Peliyagoda, Colombo|Colombo|LK|D|
LK-DP152|Telangapata, Colombo|Colombo|LK|D|
MM-DP153|Bago||MM|D|
MM-DP154|Mawlamyine||MM|D|
MM-DP155|Monywa||MM|D|
MM-DP156|Muse||MM|D|
MM-DP157|Myitnge Dry Port, Mandalay|Mandalay|MM|D|
MM-DP158|Pyay||MM|D|
MM-DP159|Tamu||MM|D|
MM-DP160|Ywathagyi Dry Port, Yangon|Yangon|MM|D|
MN-DP161|Altanbulag||MN|D|
MN-DP162|Choibalsan||MN|D|
MN-DP163|Sainshand||MN|D|
MN-DP164|Ulaanbaatar||MN|D|
MN-DP165|Zamyn-Uud||MN|D|
MY-DP166|Inland Clearance Depot Kontena Nasional, Prai|Prai|MY|D|
MY-DP167|Inland Container Depot, Padang Besar|Padang Besar|MY|D|
MY-DP168|Internal Clearance Depot Seri Setia, Kuala Lumpur|Kuala Lumpur|MY|D|
MY-DP169|Ipoh Cargo Terminal|Ipoh|MY|D|
MY-DP170|Nilai Inland Port|Nilai|MY|D|
MY-DP171|Pulau Sebang Inland Depot|Pulau Sebang|MY|D|
MY-DP172|Tebedu Inland Port, Sarawak|Sarawak|MY|D|
NP-DP173|Bhairahawa ICD|Bhairahawa|NP|D|
NP-DP174|Biratnagar ICD|Biratnagar|NP|D|
NP-DP175|Birgunj ICD|Birgunj|NP|D|
NP-DP176|Kakarbhitta ICD|Kakarbhitta|NP|D|
NP-DP177|Tatopani ICD, Larcha|Larcha|NP|D|
PH-DP178|Clark, Angeles City, Pampanga, Luzon|Angeles City, Pampanga, Luzon|PH|D|
PH-DP179|Davao City, Eastern Mindanao|Eastern Mindanao|PH|D|
PH-DP180|Koronadal City, South Cotabato|South Cotabato|PH|D|
PH-DP181|Laguindingan, Misamis Oriental, Northern Mindanao|Misamis Oriental, Northern Mindanao|PH|D|
PH-DP182|Zamboanga City, Western Mindanao|Western Mindanao|PH|D|
PK-DP183|Customs Dry Port, Hyderabad|Hyderabad|PK|D|
PK-DP184|Customs Dry Port, Peshawar|Peshawar|PK|D|
PK-DP185|Faisalabad Dry Port Trust|Faisalabad|PK|D|
PK-DP186|Lahore Dry Port, Mughalpura|Mughalpura|PK|D|
PK-DP187|Margalla Dry Ports, Islamabad|Islamabad|PK|D|
PK-DP188|Multan Dry Port Trust|Multan|PK|D|
PK-DP189|National Logistics Center Container Freight Station, Lahore|Lahore|PK|D|
PK-DP190|National Logistics Center Dry Port, Quetta|Quetta|PK|D|
PK-DP191|Pakistan Railways Prem Nagar Dry Port, Kasur|Kasur|PK|D|
PK-DP192|Railways Dry Port, Quetta|Quetta|PK|D|
PK-DP193|Sambrial Dry Port, Sialkot|Sialkot|PK|D|
PK-DP194|Silk Route Dry Port, Sost, Gilgit-Baltistan|Sost, Gilgit-Baltistan|PK|D|
RU-DP195|Cargo Terminal at the railway station Anapa, Anapa, Krasnodar Region|Anapa, Krasnodar Region|RU|D|
RU-DP196|Cargo Terminal at the railway station Artem-Primorsky, Primorsky Region|Primorsky Region|RU|D|
RU-DP197|Cargo Terminal at the railway station Azov, Azov, Rostov Region|Azov, Rostov Region|RU|D|
RU-DP198|Cargo Terminal at the railway station Nakhodka, Primorsky Region|Primorsky Region|RU|D|
RU-DP199|Cargo Terminal at the railway station Pervaya Rechka, Vladivostok, Primorsky Region|Vladivostok, Primorsky Region|RU|D|
RU-DP200|Cargo Terminal at the railway station Ussuriysk, Ussuriysk, Primorsky Region|Ussuriysk, Primorsky Region|RU|D|
RU-DP201|Container Terminal at the railway station Bazaikha, Krasnoyarsk Region|Krasnoyarsk Region|RU|D|
RU-DP202|Dmitrovsky Multimodal Centre, Moscow Region|Moscow Region|RU|D|
RU-DP203|Janino Logistic Park, Saint Petersburg Region|Saint Petersburg Region|RU|D|
RU-DP204|Kazan||RU|D|
RU-DP205|Multimodal Centre "Usady", Moscow Region|Moscow Region|RU|D|
RU-DP206|Multimodal Logistic Complex "Rostov universal port", Rostov-on-Don Region|Rostov-on-Don Region|RU|D|
RU-DP207|Multimodal Logistic Complex "Southern Primorsky Terminal", Primorsky Region|Primorsky Region|RU|D|
RU-DP208|Multimodal Logistics Container Terminal ZAO "Pacific Intermodal Container", Artyom|Artyom|RU|D|
RU-DP209|Railway Port "Baltiysky", Shushary, Saint Petersburg, Leningrad Region|Shushary, Saint Petersburg, Leningrad Region|RU|D|
RU-DP210|Railway Port "Primorsky", Ussuriysk, Primorsky Region|Ussuriysk, Primorsky Region|RU|D|
RU-DP211|Railway Port "Tamansky", Krasnodar Region|Krasnodar Region|RU|D|
RU-DP212|Terminal Logistics Centre "Beliy Rast", Moscow Region|Moscow Region|RU|D|
RU-DP213|Terminal Logistics Centre "Bronka", railway station Bronka, Saint Petersburg|railway station Bronka, Saint Petersburg|RU|D|
RU-DP214|Terminal Logistics Centre "Chik", railway station Chik, Novosibirsk Region|railway station Chik, Novosibirsk Region|RU|D|
RU-DP215|Terminal Logistics Centre "Doskino", Nizhny Novgorod Region|Nizhny Novgorod Region|RU|D|
RU-DP216|Terminal Logistics Centre "Dry port", Artyom|Artyom|RU|D|
RU-DP217|Terminal Logistics Centre "Kaliningrad"||RU|D|
RU-DP218|Terminal Logistics Centre "Khovrino", railway station Khovrino, Moscow|railway station Khovrino, Moscow|RU|D|
RU-DP219|Terminal Logistics Centre "Kleshchiha", Novosibirsk|Novosibirsk|RU|D|
RU-DP220|Terminal Logistics Centre "Kuntsevo-ll", railway station Kuntsevo-ll, Moscow|railway station Kuntsevo-ll, Moscow|RU|D|
RU-DP221|Terminal Logistics Centre "Sedelnikovo", railway station Sedelnikovo, Sverdlovsk Region|railway station Sedelnikovo, Sverdlovsk Region|RU|D|
RU-DP222|Terminal Logistics Centre "Svijazhsk", railway station Svijazhsk, Tatarstan|railway station Svijazhsk, Tatarstan|RU|D|
RU-DP223|Terminal Logistics Centre "Taltsy", railway station Taltsy, Buryatia|railway station Taltsy, Buryatia|RU|D|
RU-DP224|Terminal Logistics Centre "Vostochniy", railway station Elektrougli, Moscow Region|railway station Elektrougli, Moscow Region|RU|D|
RU-DP225|Terminal Logistics Centre at the railway station Kinel, Samara Region|Samara Region|RU|D|
RU-DP226|Terminal Logistics Complex "Yuzhnouralskiy", railway station Formachevo, Chelyabinsk Region|railway station Formachevo, Chelyabinsk Region|RU|D|
RU-DP227|Transport Logistics Centre "Pashkovsky", Krasnodar Region|Krasnodar Region|RU|D|
RU-DP228|Transport Logistics Centre "Uralsky", Ekaterinburg|Ekaterinburg|RU|D|
RU-DP229|Volgograd||RU|D|
RU-DP230|Vorsino Transport and Logistics Centre, on the border between the Moscow and Kaluga Regions|on the border between the Moscow and Kaluga Regions|RU|D|
RU-DP231|Yekaterinburg||RU|D|
RU-DP232|Zabaykalsk||RU|D|
TH-DP233|Chiang Khong, Chiang Rai|Chiang Rai|TH|D|
TH-DP234|Lat Krabang ICD, Bangkok|Bangkok|TH|D|
TJ-DP235|Dushanbe|Dushanbe|TJ|D|
TJ-DP236|Karamyk, Jirgital|Jirgital|TJ|D|
TJ-DP237|Khujand|Khujand|TJ|D|
TJ-DP238|Kurgan-Tube|Kurgan-Tube|TJ|D|
TJ-DP239|Nizhniy Panj, Qumsamgir|Qumsamgir|TJ|D|
TJ-DP240|Tursunzade|Tursunzade|TJ|D|
TJ-DP241|Vakhdat|Vakhdat|TJ|D|
TR-DP242|Bogazkopru, Kayseri|Kayseri|TR|D|
TR-DP243|Bozuyuk, Bilecik|Bilecik|TR|D|
TR-DP244|Gelemen, Samsun|Samsun|TR|D|
TR-DP245|Gokkoy, Balikesir|Balikesir|TR|D|
TR-DP246|Habur||TR|D|
TR-DP247|Halkali, Istanbul|Istanbul|TR|D|
TR-DP248|Hasanbey, Eskisehir|Eskisehir|TR|D|
TR-DP249|Kaklik, Denizli|Denizli|TR|D|
TR-DP250|Kars||TR|D|
TR-DP251|Kayacik, Konya|Konya|TR|D|
TR-DP252|Kazan, Ankara|Ankara|TR|D|
TR-DP253|Kosekoy, Izmit|Izmit|TR|D|
TR-DP254|Mardin||TR|D|
TR-DP255|Palandoken, Erzurum|Erzurum|TR|D|
TR-DP256|Sivas||TR|D|
TR-DP257|Turkoglu, Kahramanmaras|Kahramanmaras|TR|D|
TR-DP258|Usak||TR|D|
TR-DP259|Yenice, Mersin|Mersin|TR|D|
TR-DP260|Yesilbayir, Istanbul|Istanbul|TR|D|
VN-DP261|Hanoi||VN|D|
VN-DP262|ICD Gia Lai, Gia Lai Province|Gia Lai Province|VN|D|
VN-DP263|ICD Lao Cai, Lao Cai Province|Lao Cai Province|VN|D|
VN-DP264|ICD Song Than, Binh Duong Province|Binh Duong Province|VN|D|
VN-DP265|ICD Tan Cang-Long Binh, Dong Nai Province|Dong Nai Province|VN|D|
VN-DP266|ICD Tien Son, Bac Ninh Province|Bac Ninh Province|VN|D|
VN-DP267|ICD Vinh Phuc, Vinh Phuc Province|Vinh Phuc Province|VN|D|
VN-DP268|Lang Son||VN|D|
AM-IT443|Urban Logistic Services Terminal (ULS Terminal) Yerevan|Yerevan|AM|T|
AT-IT467|Aarau, Buchs|Buchs|AT|T|
AT-IT43|Bludenz CCT|Bludenz|AT|T|
AT-IT59|Brennersee (RoLa), Gries am Brenner|Gries am Brenner|AT|T|
AT-IT172|Cargo Terminal Graz, Werndorf|Werndorf|AT|T|
AT-IT131|Enns Hafen CCT|Enns|AT|T|
AT-IT178|Hall i. T. CCT, Hall in Tirol|Hall in Tirol|AT|T|
AT-IT206|Kapfenberg CCT|Kapfenberg|AT|T|
AT-IT234|Krems a.d. Donau CCT|Krems|AT|T|
AT-IT236|Lambach|Lambach|AT|T|
AT-IT243|Linz Stadthafen CCT|Linz|AT|T|
AT-IT354|Salzburg CTS, Wals|Wals|AT|T|
AT-IT355|Salzburg Frachtenbahnhof - ROLA|Salzburg|AT|T|
AT-IT377|St. Michael CCT, Madstein|Madstein|AT|T|
AT-IT378|St. Pölten Alpenbahnhof CCT|St. Pölten|AT|T|
AT-IT416|Villach Süd CCT, Fürnitz|Fürnitz|AT|T|
AT-IT425|Wels Vbf. CCT|Wels|AT|T|
AT-IT429|Wien Süd CCT|Wien|AT|T|
AT-IT428|WienCont|Wien|AT|T|
AT-IT435|Wolfurt CCT|Wolfurt|AT|T|
AT-IT437|Wörgl CCT|Wörgl|AT|T|
BE-IT10|Antwerpen ATO|Antwerp|BE|T|
BE-IT11|Antwerpen Cirkeldyk|Antwerp|BE|T|
BE-IT12|Antwerpen Combinant|Antwerp|BE|T|
BE-IT14|Antwerpen HTA Hupac Terminal Antwerp|Antwerp|BE|T|
BE-IT13|Antwerpen Main-Hub|Antwerp|BE|T|
BE-IT19|Athus Container Terminal|Athus|BE|T|
BE-IT21|Avelgem Container Terminal|Avelgem|BE|T|
BE-IT81|Charleroi Dry Port|Charleroi|BE|T|
BE-IT241|DP World Liège Container Terminals, Hermalle-sous-Argenteau|Hermalle-sous-Argenteau|BE|T|
BE-IT100|Delcatransport Rekkem|Rekkem|BE|T|
BE-IT145|Garocentre Terminal, La Louvière|La Louvière|BE|T|
BE-IT150|Geel, Laakdal|Laakdal|BE|T|
BE-IT153|Genk - Haven|Genk|BE|T|
BE-IT161|Ghent Container Terminal, Gent|Gent|BE|T|
BE-IT167|Gosselin Container Terminal, Deurne|Deurne|BE|T|
BE-IT154|H. Essers Railport Genk|Genk|BE|T|
BE-IT192|Herent Batap Terminal|Herent|BE|T|
BE-IT340|Liege Container Terminal, Angleur|Angleur|BE|T|
BE-IT242|Liège Logistics Intermodal, Grâce-Hollogne|Grâce-Hollogne|BE|T|
BE-IT270|Meerhout|Meerhout|BE|T|
BE-IT160|Mercatordok Multimodal Terminal, Gent|Gent|BE|T|
BE-IT280|Mol|Mol|BE|T|
BE-IT286|Mouscron Dry Port|Mouscron|BE|T|
BE-IT287|Muizen (Ambrogio)|Muizen|BE|T|
BE-IT63|Trimodal Terminal Brussels, Bruxelles|Bruxelles|BE|T|
BE-IT419|Vilvoorde, Grimbergen|Grimbergen|BE|T|
BA-IT479|Tuzla Container Terminal|Tuzla|BA|T|
BG-IT371|BMF Dry Port Sofia|Sofia|BG|T|
BG-IT50|Bourgas (Dolno Ezerovo)|Bourgas|BG|T|
BG-IT372|DRY PORT SOFIA, ILIYANTSI|Sofia|BG|T|
BG-IT105|Dimitrovgrad|Dimitrovgrad|BG|T|
BG-IT382|Stara Zagora|Stara Zagora|BG|T|
BG-IT442|Yana Sofia Intermodal Terminal|Sofia|BG|T|
BG-IT454|Zlatitrap (Plovdiv)|Zlatitrap|BG|T|
HR-IT444|Kontejnerski Terminal Zagreb-Vrapče|Zagreb|HR|T|
HR-IT232|Kotoriba|Kotoriba|HR|T|
HR-IT307|Osijek|Osijek|HR|T|
HR-IT321|Ploče|Ploče|HR|T|
HR-IT343|Rijeka Brajdica|Rijeka|HR|T|
HR-IT369|Slavonski Brod|Slavonski Brod|HR|T|
HR-IT373|Solin Luka (Split)|Split|HR|T|
CZ-IT60|Brno|Brno|CZ|T|
CZ-IT80|Ceska Trebova|Ceska Trebova|CZ|T|
CZ-IT228|Kopřivnice|Kopřivnice|CZ|T|
CZ-IT248|Lovosice (TSC)|Lovosice|CZ|T|
CZ-IT249|Lovosice (ČD - DUSS Terminal)|Lovosice|CZ|T|
CZ-IT282|Mošnov|Mošnov|CZ|T|
CZ-IT271|Mělník Labe|Mělník|CZ|T|
CZ-IT304|Obrnice|Obrnice|CZ|T|
CZ-IT311|Ostrava Senov|Ostrava|CZ|T|
CZ-IT310|Ostrava-Paskov Terminal|Paskov|CZ|T|
CZ-IT303|Plzen - Nyrany|Nyrany|CZ|T|
CZ-IT323|Plzeń|Plzeń|CZ|T|
CZ-IT326|Praha Uhrineves, Praha 10|Praha 10|CZ|T|
CZ-IT327|Přerov, Přerov - Horní Moštěnice|Přerov - Horní Moštěnice|CZ|T|
CZ-IT445|Zaječí|Zaječí|CZ|T|
CZ-IT411|Ústí nad Labem - Marianska skala|Ústí nad Labem|CZ|T|
CZ-IT451|Želechovice - Zlin, Želechovice nad Dřevnicí -Lípa|Želechovice nad Dřevnicí -Lípa|CZ|T|
DK-IT194|Høje Taastrup|Høje Taastrup|DK|T|
DK-IT313|Padborg|Padborg|DK|T|
DK-IT345|Rønland (Cheminova, Harboøre|Harboøre|DK|T|
DK-IT394|Taulov, Fredericia|Fredericia|DK|T|
FI-IT473|RRT Kouvola|Kouvola|FI|T|
FR-IT2|Aiton, Bourgneuf|Bourgneuf|FR|T|
FR-IT22|Avignon-Courtine (Novatrans)|Avignon|FR|T|
FR-IT33|Bayonne Mouguerre Intermodal|Mouguerre|FR|T|
FR-IT483|Bonneuil-sur-Marne (Paris Terminal)|Bonneuil-sur-Marne|FR|T|
FR-IT48|Bordeaux Combiné (Naviland), Bègles|Bègles|FR|T|
FR-IT61|Bruay sur l'Escaut (Valenciennes)|Bruay sur l'Escaut|FR|T|
FR-IT74|Calais, Marck|Marck|FR|T|
FR-IT83|Clermont-Ferrand, Gerzat|Gerzat|FR|T|
FR-IT87|Cognac|Cognac|FR|T|
FR-IT103|Dijon, Perrigny-lès-Dijon|Perrigny-lès-Dijon|FR|T|
FR-IT111|Dourges Conteneurs Terminal Delta 3, Hénin-Baeumont Cedex|Hénin-Baeumont Cedex|FR|T|
FR-IT486|Evry|Evry|FR|T|
FR-IT155|Gennevilliers|Gennevilliers|FR|T|
FR-IT238|Lauterbourg - R3flex|Lauterbourg|FR|T|
FR-IT239|Le Havre (LHTE), Sandouville|Sandouville|FR|T|
FR-IT484|Limay|Limay|FR|T|
FR-IT485|Longueuil Sainte-Marie, Longueil-Sainte-Marie|Longueil-Sainte-Marie|FR|T|
FR-IT255|Lyon-St. Priest, Saint-Priest|Saint-Priest|FR|T|
FR-IT276|Miramas, Grans|Grans|FR|T|
FR-IT285|Mouguerre (Ambrogio)|Mouguerre|FR|T|
FR-IT298|Noisy-le-Sec|Noisy-le-Sec|FR|T|
FR-IT312|Ottmarsheim|Ottmarsheim|FR|T|
FR-IT487|Paris La Bourdonnais|Paris|FR|T|
FR-IT47|Paris Terminal, Gennevilliers|Gennevilliers|FR|T|
FR-IT319|Perpignan Saint-Charles Conteneur Terminal|Perpignan|FR|T|
FR-IT328|Prouvy|Prouvy|FR|T|
FR-IT385|Strasbourg Terminal Conteneurs Nord|Strasbourg|FR|T|
FR-IT386|Strasbourg Terminal Conteneurs Sud|Strasbourg|FR|T|
FR-IT482|Terminal Ouest Provence, Grans|Grans|FR|T|
FR-IT401|Toulouse - Fenouillet|Fenouillet|FR|T|
FR-IT490|Valenton, Bonneuil sur Marne|Bonneuil sur Marne|FR|T|
GE-IT460|Poti|Poti|GE|T|
DE-IT1|Adelebser Container Terminal (ACT), Adelebsen|Adelebsen|DE|T|
DE-IT4|Aken|Aken|DE|T|
DE-IT18|Aschaffenburg|Aschaffenburg|DE|T|
DE-IT20|Augsburg-Oberhausen|Augsburg|DE|T|
DE-IT25|Bamberg|Bamberg|DE|T|
DE-IT32|Basel - Weil am Rhein (DUSS)|Weil am Rhein|DE|T|
DE-IT29|Basel - Weil am Rhein (Rheinhafen)|Weil am Rhein|DE|T|
DE-IT104|Beckingen|Beckingen|DE|T|
DE-IT34|Beiseförth, Malsfeld|Malsfeld|DE|T|
DE-IT37|Berlin Westhafen|Berlin|DE|T|
DE-IT39|Binnenhafen Berlin West Wustermark|Wustermark|DE|T|
DE-IT46|Bonn|Bonn|DE|T|
DE-IT53|Braunschweig Containerterminal|Braunschweig|DE|T|
DE-IT54|Bremen Hansakai|Bremen|DE|T|
DE-IT55|Bremen Weserport|Bremen|DE|T|
DE-IT56|Bremen-Roland|Bremen|DE|T|
DE-IT58|Bremerhaven CTI / II / III|Bremerhaven|DE|T|
DE-IT62|Brunsbüttel Elbehafen|Brunsbüttel|DE|T|
DE-IT71|Burghausen|Burghausen|DE|T|
DE-IT45|Bönen|Bönen|DE|T|
DE-IT9|CSA Terminal Andernach|Andernach|DE|T|
DE-IT250|CTL - Cargo-Terminal Lehmann, Lübeck|Lübeck|DE|T|
DE-IT203|CargoBeamer-Terminal Kaldenkirchen, Nettetal|Nettetal|DE|T|
DE-IT85|Cloppenburg C-Port, Saterland-Sedelsberg (Friesoythe)|Saterland-Sedelsberg (Friesoythe)|DE|T|
DE-IT109|Container Terminal Dortmund "Am Hafenbahnhof" (CTD II)|Dortmund|DE|T|
DE-IT110|Container Terminal Dortmund (CTD)|Dortmund|DE|T|
DE-IT135|Container Terminal Fallersleben, Wolfsburg/Fallersleben|Wolfsburg/Fallersleben|DE|T|
DE-IT179|Container Terminal Halle Saale - CTHS, Halle (Saale)|Halle (Saale)|DE|T|
DE-IT91|Container Terminal Herne|Herne|DE|T|
DE-IT189|Container-Terminal Hafen Heilbronn|Heilbronn|DE|T|
DE-IT95|Cuxhaven|Cuxhaven|DE|T|
DE-IT106|Dormagen|Dormagen|DE|T|
DE-IT112|Dresden Trailerport Alberthafen|Dresden|DE|T|
DE-IT113|Dresden-Friedrichstadt UBF (GVZ)|Dresden|DE|T|
DE-IT116|Duisburg DIT|Duisburg|DE|T|
DE-IT459|Duisburg Gateway Terminal (DGT)|Duisburg|DE|T|
DE-IT122|Duisburg KV-Hub Rhein-Ruhr|Duisburg|DE|T|
DE-IT117|Duisburg Kombiterminal (DKT)|Duisburg|DE|T|
DE-IT120|Duisburg RRT (Logport II)|Duisburg|DE|T|
DE-IT119|Duisburg RRT (Parallelhafen)|Duisburg|DE|T|
DE-IT121|Duisburg Trimodal Terminal (D3T)|Duisburg|DE|T|
DE-IT118|Duisburg Ziel Terminal|Duisburg|DE|T|
DE-IT108|Dörpen DUK|Dörpen|DE|T|
DE-IT124|Düsseldorf HGK|Düsseldorf|DE|T|
DE-IT125|Eisenach|Eisenach|DE|T|
DE-IT433|ElbePort Wittenberge|Wittenberge|DE|T|
DE-IT127|Elsterwerda|Elsterwerda|DE|T|
DE-IT128|Emmelsum (Contargo), Voerde (Emmelsum)|Voerde (Emmelsum)|DE|T|
DE-IT129|Emmelsum (Jerich), Voerde (Emmelsum)|Voerde (Emmelsum)|DE|T|
DE-IT130|Emmerich Rhein-Waal-Terminal, Emmerich am Rhein|Emmerich am Rhein|DE|T|
DE-IT132|Erfurt-Vieselbach|Erfurt|DE|T|
DE-IT134|Falkenhagen, Pritzwalk|Pritzwalk|DE|T|
DE-IT141|Frankfurt (Oder)|Frankfurt (Oder)|DE|T|
DE-IT139|Frankfurt am Main (Ost)|Frankfurt am Main|DE|T|
DE-IT140|Frankfurt am Main (Osthafen)|Frankfurt am Main|DE|T|
DE-IT138|Frankfurt am Main (West)|Frankfurt am Main|DE|T|
DE-IT156|Germersheim (DP World)|Germersheim|DE|T|
DE-IT157|Germersheim (Freyer)|Germersheim|DE|T|
DE-IT158|Gernsheim|Gernsheim|DE|T|
DE-IT159|Gerolstein CT|Gerolstein|DE|T|
DE-IT162|Glauchau|Glauchau|DE|T|
DE-IT36|Großbeeren|Großbeeren|DE|T|
DE-IT174|Gustavsburg, Ginsheim-Gustavsburg|Ginsheim-Gustavsburg|DE|T|
DE-IT170|Göttingen|Göttingen|DE|T|
DE-IT175|Gütersloh|Gütersloh|DE|T|
DE-IT181|Hamburg - Altenwerder (CTA)|Hamburg|DE|T|
DE-IT182|Hamburg - Billwerder|Hamburg|DE|T|
DE-IT183|Hamburg - Burchardkai (CTB)|Hamburg|DE|T|
DE-IT184|Hamburg - Eurokombi Waltershof|Hamburg|DE|T|
DE-IT185|Hamburg - Tollerort (CTT)|Hamburg|DE|T|
DE-IT186|Hannover MegaHub Lehrte|Lehrte|DE|T|
DE-IT187|Hannover-Leinetor|Hannover|DE|T|
DE-IT188|Hannover-Nordhafen|Hannover|DE|T|
DE-IT193|Hof|Hof|DE|T|
DE-IT195|Horb, Horb am Neckar|Horb am Neckar|DE|T|
DE-IT115|Hutchison Ports Duisburg|Duisburg|DE|T|
DE-IT197|Hürth Knapsack|Hürth|DE|T|
DE-IT381|Industriebahnhof Stade-Brunshausen (IBB)|Stade|DE|T|
DE-IT198|Ingolstadt|Ingolstadt|DE|T|
DE-IT431|KV-Terminal Wilhelmshaven|Wilhelmshaven|DE|T|
DE-IT208|Karlsruhe (Contargo)|Karlsruhe|DE|T|
DE-IT207|Karlsruhe (DUSS)|Karlsruhe|DE|T|
DE-IT209|Kassel|Kassel|DE|T|
DE-IT213|Kehl - Euro Terminal Kehl|Kehl|DE|T|
DE-IT214|Kehl - Klumpp + Müller|Kehl|DE|T|
DE-IT215|Kiel Norwegenkai|Kiel|DE|T|
DE-IT216|Kiel Ostuferhafen|Kiel|DE|T|
DE-IT217|Kiel Schwedenkai|Kiel|DE|T|
DE-IT220|Koblenz|Koblenz|DE|T|
DE-IT222|Kodersdorf|Kodersdorf|DE|T|
DE-IT229|Kornwestheim|Kornwestheim|DE|T|
DE-IT233|Krefeld|Krefeld|DE|T|
DE-IT223|Köln Eifeltor|Köln|DE|T|
DE-IT225|Köln-Niehl HGK|Köln|DE|T|
DE-IT224|Köln-Nord|Köln|DE|T|
DE-IT237|Landshut|Landshut|DE|T|
DE-IT240|Leipzig-Wahren|Leipzig|DE|T|
DE-IT253|Ludwigshafen (Contargo)|Ludwigshafen|DE|T|
DE-IT252|Ludwigshafen KTL|Ludwigshafen|DE|T|
DE-IT251|Lübeck-Skandinavienkai|Lübeck|DE|T|
DE-IT258|Magdeburg Hanse-Terminal|Magdeburg|DE|T|
DE-IT260|Mainz CT|Mainz|DE|T|
DE-IT265|Mannheim Container-Terminal Contargo|Mannheim|DE|T|
DE-IT264|Mannheim DP World|Mannheim|DE|T|
DE-IT266|Mannheim-Handelshafen|Mannheim|DE|T|
DE-IT268|Marl|Marl|DE|T|
DE-IT481|Maxi Terminal Hamm|Hamm|DE|T|
DE-IT226|Metrans Containerterminal Berlin, Königs Wusterhausen|Königs Wusterhausen|DE|T|
DE-IT275|Minden|Minden|DE|T|
DE-IT38|Multimodal Terminal Berlin, Wustermark|Wustermark|DE|T|
DE-IT288|München-Riem|München|DE|T|
DE-IT291|Neumünster|Neumünster|DE|T|
DE-IT292|Neuss Contargo|Neuss|DE|T|
DE-IT293|Neuss Trimodal|Neuss|DE|T|
DE-IT302|Nürnberg (Depot)|Nürnberg|DE|T|
DE-IT301|Nürnberg-Hafen TriCon|Nürnberg|DE|T|
DE-IT308|Osnabrück|Osnabrück|DE|T|
DE-IT465|Rail Gate Bremerhaven|Bremerhaven|DE|T|
DE-IT114|Rail Hub Duisburg|Duisburg|DE|T|
DE-IT57|Rail Terminal Bremerhaven|Bremerhaven|DE|T|
DE-IT335|Regensburg Hafen|Regensburg|DE|T|
DE-IT336|Regensburg Ost|Regensburg|DE|T|
DE-IT337|Rehden|Rehden|DE|T|
DE-IT341|Rheine GVZ|Rheine|DE|T|
DE-IT342|Riesa|Riesa|DE|T|
DE-IT346|Rostock-Seehafen|Rostock|DE|T|
DE-IT356|Salzgitter GVZ|Salzgitter|DE|T|
DE-IT358|Schkopau Kombiterminal Buna Werke|Schkopau|DE|T|
DE-IT359|Schwarzheide|Schwarzheide|DE|T|
DE-IT360|Schweinfurt|Schweinfurt|DE|T|
DE-IT364|Singen|Singen|DE|T|
DE-IT474|Straubing-Sand, Aiterhofen|Aiterhofen|DE|T|
DE-IT387|Stuttgart DP World|Stuttgart|DE|T|
DE-IT388|Stuttgart Hafen|Stuttgart|DE|T|
DE-IT92|Südwestfalen Container-Terminal, Kreuztal|Kreuztal|DE|T|
DE-IT403|Trier - Multimodal Terminal Trier|Trier|DE|T|
DE-IT176|UHH Container Terminal Haldensleben|Haldensleben|DE|T|
DE-IT408|Ulm, Dornstadt (Ulm)|Dornstadt (Ulm)|DE|T|
DE-IT410|Unna|Unna|DE|T|
DE-IT421|Warstein|Warstein|DE|T|
DE-IT374|Weets Container Terminal, Soltau|Soltau|DE|T|
DE-IT427|Werra Kombi Terminal, Philippsthal|Philippsthal|DE|T|
DE-IT430|Wiesau|Wiesau|DE|T|
DE-IT432|Wismar-Hafen|Wismar|DE|T|
DE-IT434|Wolfsburg GVZ|Wolfsburg|DE|T|
DE-IT438|Worms|Worms|DE|T|
DE-IT441|Wuppertal-Langerfeld|Wuppertal|DE|T|
DE-IT439|Wörth|Wörth|DE|T|
GR-IT397|Intermodal Station Thessaloniki, Sindos|Sindos|GR|T|
GR-IT491|Thessaloniki|Thessaloniki|GR|T|
HU-IT70|Budapest BILK|Budapest|HU|T|
HU-IT99|Debrecen|Debrecen|HU|T|
HU-IT136|Fényeslitke - East-West Gate (EWG)|Fényeslitke|HU|T|
HU-IT331|HUB Budapest|Budapest|HU|T|
HU-IT400|Kombiterminál Törökbálint|Törökbálint|HU|T|
HU-IT259|Mahart Container Center, Budapest|Budapest|HU|T|
HU-IT375|Sopron container terminal|Sopron|HU|T|
HU-IT391|Szeged PSP Terminal|Szeged|HU|T|
IT-IT420|Arluno|Arluno|IT|T|
IT-IT28|Bari Scalo Ferruccio|Bari|IT|T|
IT-IT44|Bologna Interporto, Bentivoglio|Bentivoglio|IT|T|
IT-IT72|Busto Arsizio-Gallarate|Busto Arsizio|IT|T|
IT-IT75|Candiolo, Candiolo (TO)|Candiolo (TO)|IT|T|
IT-IT77|Catania Bicocca|Catania|IT|T|
IT-IT94|Cremona Port|Cremona|IT|T|
IT-IT137|Foggia|Foggia|IT|T|
IT-IT144|Gallarate, Gallarate (VA)|Gallarate (VA)|IT|T|
IT-IT402|Interporto Trento|Trento|IT|T|
IT-IT256|Maddaloni|Maddaloni|IT|T|
IT-IT269|Marzaglia, Modena|Modena|IT|T|
IT-IT272|Melzo|Melzo|IT|T|
IT-IT494|Milano Smistamento, Pioltello MI|Pioltello MI|IT|T|
IT-IT300|Novara CIM|Novara|IT|T|
IT-IT314|Padova Container Service terminal|Padova|IT|T|
IT-IT315|Padova Interporto Terminal, Padova PD|Padova PD|IT|T|
IT-IT317|Parma, Fontevivo Parma|Fontevivo Parma|IT|T|
IT-IT469|Piacenza|Piacenza|IT|T|
IT-IT320|Piadena|Piadena|IT|T|
IT-IT468|Pordenone|Pordenone|IT|T|
IT-IT281|Terminal Intermodale di Mortara|Mortara|IT|T|
IT-IT399|Torino|Torino|IT|T|
IT-IT404|Trieste - Europa Multipurpose Terminals|Trieste|IT|T|
IT-IT406|Trieste - Samer Seaports & Terminals|Trieste|IT|T|
IT-IT405|Trieste Marine Terminal|Trieste|IT|T|
IT-IT414|Verona Quadrante Europa|Verona|IT|T|
LV-IT334|Railport Riga|Riga|LV|T|
LT-IT212|Kaunas Intermodal Terminal|Kaunas|LT|T|
LT-IT218|Klaipeda Container Terminal|Klaipeda|LT|T|
LT-IT219|Klaipedos Smelte container terminal (KSCT), Klaipeda|Klaipeda|LT|T|
LT-IT418|Vilnius Vaidotay Intermodal Terminal|Vilnius|LT|T|
LT-IT417|Vilnius intermodal terminal|Vilnius|LT|T|
LU-IT40|Intermodal Terminal Bettembourg, Dudelange|Dudelange|LU|T|
LU-IT273|Mertert|Mertert|LU|T|
MK-IT367|Skopje|Skopje|MK|T|
NL-IT5|Alblasserdam|Alblasserdam|NL|T|
NL-IT7|Almelo|Almelo|NL|T|
NL-IT27|Barge Terminal Tilburg BV|Tilburg|NL|T|
NL-IT476|Bergen op Zoom|Bergen op Zoom|NL|T|
NL-IT191|Combi Terminal Twente (Hengelo), LA Hengelo|LA Hengelo|NL|T|
NL-IT318|Combi Terminal Twente (Rotterdam), Rotterdam-Pernis|Rotterdam-Pernis|NL|T|
NL-IT456|Cuijk, NM Katwijk|NM Katwijk|NL|T|
NL-IT101|Den Bosch|Den Bosch|NL|T|
NL-IT350|ECT Delta Terminal, Rotterdam|Rotterdam|NL|T|
NL-IT86|Europark-Terminal Coevorden (ETC)|Coevorden|NL|T|
NL-IT165|Gorinchem LCG|Gorinchem|NL|T|
NL-IT173|Groningen Railport, Veendam|Veendam|NL|T|
NL-IT199|Inland Terminal Veghel|Veghel|NL|T|
NL-IT205|Kampen|Kampen|NL|T|
NL-IT279|Moerdijk CCT, PM Moerdijk|PM Moerdijk|NL|T|
NL-IT295|Nijmegen|Nijmegen|NL|T|
NL-IT457|Oss|Oss|NL|T|
NL-IT309|Osse Overslag Centrale|Oss|NL|T|
NL-IT333|Rail Port Brabant, Tilburg|Tilburg|NL|T|
NL-IT151|Rail Terminal Chemelot (Geleen)|Geleen|NL|T|
NL-IT344|Roermond|Roermond|NL|T|
NL-IT347|Rotterdam APM Terminals Maasvlakte II|Rotterdam|NL|T|
NL-IT348|Rotterdam Botlek, Botlek (Rotterdam)|Botlek (Rotterdam)|NL|T|
NL-IT349|Rotterdam Euromax|Rotterdam|NL|T|
NL-IT351|Rotterdam RSC / Waalhaven|Rotterdam|NL|T|
NL-IT352|Rotterdam RWG|Rotterdam|NL|T|
NL-IT413|Venray, Wanssum|Wanssum|NL|T|
PL-IT64|Brwinów|Brwinów|PL|T|
PL-IT65|Brzeg Dolny Terminal PCC|Brzeg Dolny|PL|T|
PL-IT66|Brzeski Terminal Kontenerowy, Brzesko|Brzesko|PL|T|
PL-IT84|CLIP Container Terminal Swarzędz|Swarzędz|PL|T|
PL-IT466|CLIP Intermodal Terminal, Jasin|Jasin|PL|T|
PL-IT143|Container Terminal GĄDKI, Gadki|Gadki|PL|T|
PL-IT423|Container Terminal Warszawa|Warszawa|PL|T|
PL-IT247|Container Terminal Łódź|Łódź|PL|T|
PL-IT164|Containerterminal Gliwice|Gliwice|PL|T|
PL-IT221|Containerterminal Kobylnica|Kobylnica|PL|T|
PL-IT278|Containerterminal Mława|Mława|PL|T|
PL-IT97|Dąbrowa Górnicza (ATS)|Dąbrowa Górnicza|PL|T|
PL-IT96|Dąbrowa Górnicza (Metrans)|Dąbrowa Górnicza|PL|T|
PL-IT370|Euroterminal Sławków|Sławków|PL|T|
PL-IT126|Ełk|Ełk|PL|T|
PL-IT148|Gdanski Terminal Konterowy|Gdansk|PL|T|
PL-IT147|Gdańsk Baltic Hub|Gdańsk|PL|T|
PL-IT149|Gdynia - Baltic Containter Terminal|Gdynia|PL|T|
PL-IT493|Gdynia - Gdynia Container Terminal|Gdynia|PL|T|
PL-IT163|Gliwice Terminal PCC|Gliwice|PL|T|
PL-IT196|HUB Terminal Poznan, Gądki|Gądki|PL|T|
PL-IT210|Katowice Wlosienica|Wlosienica|PL|T|
PL-IT235|Kutno|Kutno|PL|T|
PL-IT211|Kąty Wrocławskie Container-terminal|Kąty Wrocławskie|PL|T|
PL-IT261|Małaszewicze Adampol|Małaszewicze|PL|T|
PL-IT263|Małaszewicze Kontenerowa (PKP)|Małaszewicze|PL|T|
PL-IT353|Rzepin|Rzepin|PL|T|
PL-IT365|Sjius Depot Kontenerowy, Zalesie|Zalesie|PL|T|
PL-IT376|Sosnowiec|Sosnowiec|PL|T|
PL-IT395|Terespol Containerdepot|Terespol|PL|T|
PL-IT329|Terminal Kontenerowy Pruszków|Pruszków|PL|T|
PL-IT325|Terminal Poznań Junikowo|Poznań|PL|T|
PL-IT330|Terminal Radomsko|Radomsko|PL|T|
PL-IT424|Terminal Warszawa Praga-Północ|Warszawa|PL|T|
PL-IT245|Terminal Łódź Chojny|Łódź|PL|T|
PL-IT422|Warszawa Glowna Toworowa - Container Terminal|Warszawa|PL|T|
PL-IT436|Wolica|Wolica|PL|T|
PL-IT440|Wroclaw Siechnice|Siechnice|PL|T|
PL-IT462|Zalesie (BG Depot)|Zalesie|PL|T|
PL-IT447|Zalesie (ZRD Containers)|Zalesie|PL|T|
PL-IT448|Zamość|Zamość|PL|T|
PL-IT246|Łódź iHub|Łódź|PL|T|
RO-IT16|Afluent Arad South Terminal|Arad|RO|T|
RO-IT3|Aiud|Aiud|RO|T|
RO-IT322|Allianso Terminal Ploiesti|Ploiesti|RO|T|
RO-IT480|Brasov|Brasov|RO|T|
RO-IT67|Bucharest (DB Schenker)|Bucharest|RO|T|
RO-IT68|Bucharest Intermodal Terminal|Bucharest|RO|T|
RO-IT69|Bucuresti Sud, Bucharest|Bucharest|RO|T|
RO-IT76|Caransebes|Caransebes|RO|T|
RO-IT79|Center Tea & Co Terminal, Leordeni|Leordeni|RO|T|
RO-IT88|Constanta Port (APM)|Constanta|RO|T|
RO-IT90|Constanta Port (Tomis)|Constanta|RO|T|
RO-IT89|Constanta South Container Terminal (DP World)|Constanta|RO|T|
RO-IT15|Container Terminal Railport Arad, Curtici|Curtici|RO|T|
RO-IT107|Dornesti|Dornesti|RO|T|
RO-IT274|Miercurea Ciuc|Miercurea Ciuc|RO|T|
RO-IT305|Oradea Vest|Oradea|RO|T|
RO-IT24|Rail Container Bacau|Bacau|RO|T|
RO-IT332|Rail Hub Transylvania, Vladimirescu|Vladimirescu|RO|T|
RO-IT23|Rofersped Terminal Bacau|Bacau|RO|T|
RO-IT389|Suceava|Suceava|RO|T|
RO-IT464|Teius International Intermodal Terminal, Teiuș|Teiuș|RO|T|
RO-IT407|Turda|Turda|RO|T|
RO-IT446|Zalau|Zalau|RO|T|
RU-IT204|Freight Village RU (Kaluga), Vorsino selo|Vorsino selo|RU|T|
RU-IT297|Nizhny Novgorod|Nizhny Novgorod|RU|T|
RS-IT492|, Sremska Mitrovica|Sremska Mitrovica|RS|T|
RS-IT35|Belgrade|Belgrade|RS|T|
RS-IT296|Nis, Niš|Niš|RS|T|
RS-IT316|Pančevo Dry Port Terminal|Pančevo|RS|T|
SK-IT51|Bratislava Palenisko|Bratislava|SK|T|
SK-IT52|Bratislava ÚNS (ČSKD INTRANS)|Bratislava|SK|T|
SK-IT123|Dunajská Streda|Dunajská Streda|SK|T|
SK-IT230|Košice (Metrans), Koice|Koice|SK|T|
SK-IT231|Košice (ČSKD INTRANS)|Košice|SK|T|
SK-IT254|Lužianky - TIP|Lužianky|SK|T|
SK-IT368|Sládkovičovo Kontajnerový terminál|Sládkovičovo|SK|T|
SK-IT398|TKD Dobrá|Dobrá|SK|T|
SK-IT452|Žilina (RCG)|Žilina|SK|T|
SK-IT453|Žilina (TIP)|Žilina|SK|T|
SI-IT78|Celje|Celje|SI|T|
SI-IT227|Koper Luka KT|Koper|SI|T|
SI-IT244|Ljubljana Moste|Ljubljana|SI|T|
SI-IT267|Maribor Tezno KT|Maribor|SI|T|
SI-IT362|Seana, Sežana|Sežana|SI|T|
ES-IT6|Algeciras Merciancías|Algeciras|ES|T|
ES-IT8|Almussafes|Almussafes|ES|T|
ES-IT475|Badajoz|Badajoz|ES|T|
ES-IT478|Barcelona Combiconnect, La Llagosta|La Llagosta|ES|T|
ES-IT26|Barcelona Morrot|Barcelona|ES|T|
ES-IT93|Córdoba El Higuerón, Cordoba|Cordoba|ES|T|
ES-IT171|Granollers Mercancias|Granollers|ES|T|
ES-IT200|Irún Merciancías, Guipuzcoa|Guipuzcoa|ES|T|
ES-IT202|Júndiz, Vitoria-Gasteiz, Álava|Vitoria-Gasteiz, Álava|ES|T|
ES-IT393|La Boella, Tarragona|Tarragona|ES|T|
ES-IT257|Madrid Abronigal|Madrid|ES|T|
ES-IT277|Miranda Container Terminal, Burgos|Burgos|ES|T|
ES-IT289|Murcia, Nonduermas|Nonduermas|ES|T|
ES-IT324|Portbou Mercancías, Girona|Girona|ES|T|
ES-IT357|San Roque, La Estacion de San Roque|La Estacion de San Roque|ES|T|
ES-IT361|Sevilla La Negrilla|Sevilla|ES|T|
ES-IT363|Silla|Silla|ES|T|
ES-IT392|Tarragona Constanti|Tarragona|ES|T|
ES-IT415|Vigo-Guixar, Vigo (Pontevedra)|Vigo (Pontevedra)|ES|T|
ES-IT450|Zaragoza - Terminal Maratima de Zaragoza|Zaragoza|ES|T|
ES-IT449|Zaragoza Plaza|Zaragoza|ES|T|
SE-IT49|Borlänge Combiterminal|Borlänge|SE|T|
SE-IT366|Dryport Skaraborg, Falköping|Falköping|SE|T|
SE-IT133|Eskilstuna Kombiterminal|Eskilstuna|SE|T|
SE-IT168|Gothenburg Arken Combi Terminal|Gothenburg|SE|T|
SE-IT146|Gävle kombiterminal|Gävle|SE|T|
SE-IT169|Göteborg-Majnabbe|Göteborg|SE|T|
SE-IT180|Hallsberg|Hallsberg|SE|T|
SE-IT190|Helsingborg kombiterminal|Helsingborg|SE|T|
SE-IT201|Jönköping Solåsen kombiterminal|Jönköping|SE|T|
SE-IT463|Katrineholm|Katrineholm|SE|T|
SE-IT495|Kiruna|Kiruna|SE|T|
SE-IT262|Malmö kombiterminal|Malmö|SE|T|
SE-IT299|Norrköping|Norrköping|SE|T|
SE-IT290|Nässjö kombiterminal|Nässjö|SE|T|
SE-IT384|Stockholm Nord Intermodal Terminal, Rosersberg|Rosersberg|SE|T|
SE-IT383|Stockholm Årsta kombiterminal|Stockholm|SE|T|
SE-IT390|Sundsvall Combi Terminal|Sundsvall|SE|T|
SE-IT409|Umeå Combi Terminal|Umeå|SE|T|
SE-IT412|Västerås kombiterminal|Västerås|SE|T|
SE-IT426|Wermland Logistic Center, Vålberg|Vålberg|SE|T|
SE-IT306|Örebro|Örebro|SE|T|
CH-IT30|Basel - Kleinhüningen|Basel|CH|T|
CH-IT31|Basel - Swissterminal|Basel|CH|T|
CH-IT471|Basel Wolf (Hupac)|Basel|CH|T|
CH-IT472|Basel Wolf (SBB)|Basel|CH|T|
CH-IT42|Birsfelden (Birsterminal)|Birsfelden|CH|T|
CH-IT41|Birsfelden (Swissterminal)|Birsfelden|CH|T|
CH-IT73|Cadenazzo|Cadenazzo|CH|T|
CH-IT82|Chavornay|Chavornay|CH|T|
CH-IT470|Chiasso, Balerna|Balerna|CH|T|
CH-IT98|Dagmersellen|Dagmersellen|CH|T|
CH-IT102|Dietikon|Dietikon|CH|T|
CH-IT142|Frenkendorf|Frenkendorf|CH|T|
CH-IT152|Genève La Praille, Genève 26|Genève 26|CH|T|
CH-IT166|Gossau SG|Gossau|CH|T|
CH-IT294|Niederglatt, Niederhasli|Niederhasli|CH|T|
CH-IT338|Rekingen, Mellikon|Mellikon|CH|T|
CH-IT339|Renens|Renens|CH|T|
CH-IT379|Staad|Staad|CH|T|
CH-IT380|Stabio|Stabio|CH|T|
CH-IT489|Visp (Alpin Cargo)|Visp|CH|T|
CH-IT488|Visp (Bertschi)|Visp|CH|T|
TR-IT17|Arifiye Hub-REYSAŞ, Adapazarı|Adapazarı|TR|T|
TR-IT177|Halkali (Mars Logistics), Küçükçekmece/İstanbul|Küçükçekmece/İstanbul|TR|T|
TR-IT477|Railport Terminal İşletmeleri, Kartepe/Kocaeli|Kartepe/Kocaeli|TR|T|
UA-IT458|Boryspil - BIT VANTAGE|Boryspil|UA|T|
UA-IT283|Most Logistic Terminal, Volytsya|Volytsya|UA|T|
UA-IT284|Mostyska Container Terminal, Mostyska Druhi|Mostyska Druhi|UA|T|
UA-IT461|Multimodal Transshipment Terminal Autocom, Starovoitove|Starovoitove|UA|T|
UA-IT396|Ternopil - West Container Terminal|Ternopil|UA|T|
US-RR001|General Cargo Terminal, Anchorage|Anchorage, AK|US|R|ARR
US-RR002|Huntsville|Huntsville, AL|US|R|NS
US-RR003|Birmingham, McCalla|McCalla, AL|US|R|NS
US-RR004|Container Terminal, Mobile|Mobile, AL|US|R|CN, CSX, KCS, ALE, CGR, TASD
US-RR005|Intermodal Container Transfer Facility (ICTF), Mobile|Mobile, AL|US|R|TASD
US-RR006|Main Docks/General Cargo, Mobile|Mobile, AL|US|R|BNSF, CN, CSX, KCS, NS, AGR, ALE, CGR, TASD
US-RR007|Bessemer, AL - Central Alabama ICTF (CAICTF), North Bessemer|North Bessemer, AL|US|R|CSX
US-RR008|Marion|Marion, AR|US|R|UP
US-RR009|Phoenix, AZ - Glendale|Glendale, AZ|US|R|BNSF
US-RR010|Tucson|Tucson, AZ|US|R|UP
US-RR011|Los Angeles, CA - East Washington Blvd, City of Commerce|City of Commerce, CA|US|R|UP
US-RR012|Los Angeles, CA - City of Industry|City of Industry, CA|US|R|UP
US-RR013|Commerce|Commerce, CA|US|R|BNSF
US-RR014|Lathrop, French Camp|French Camp, CA|US|R|UP
US-RR015|Long Beach, CA - ICTF|Long Beach, CA|US|R|UP
US-RR016|Long Beach, CA - International Transportation Service (ITS/Pier G)|Long Beach, CA|US|R|PHL
US-RR017|Long Beach, CA - Long Beach Container Terminal (LBCT/Pier E)|Long Beach, CA|US|R|PHL
US-RR018|Long Beach, CA - Pacific Container Terminal (PCT/Pier J)|Long Beach, CA|US|R|PHL
US-RR019|Long Beach, CA - SSA Terminals (Pier A)|Long Beach, CA|US|R|PHL
US-RR020|Total Terminals International (TTI/Pier T), Long Beach|Long Beach, CA|US|R|PHL
US-RR021|Los Angeles, CA - Hobart|Los Angeles, CA|US|R|BNSF
US-RR022|Los Angeles, CA - Lamar St (LATC)|Los Angeles, CA|US|R|UP
US-RR023|Ben E. Nutter Terminal, Oakland|Oakland, CA|US|R|BNSF, UP via OTR
US-RR024|Charles P. Howard Terminal, Oakland|Oakland, CA|US|R|BNSF, UP via OTR
US-RR025|Matson Terminal, Oakland|Oakland, CA|US|R|BNSF, UP via OTR
US-RR026|Oakland International Container Terminal (OICT)|Oakland, CA|US|R|BNSF, UP via OTR
US-RR027|Oakland International Gateway (OIG) - Joint Intermodal Terminal (JIT)|Oakland, CA|US|R|BNSF
US-RR028|Railport Oakland|Oakland, CA|US|R|UP
US-RR029|TraPac Terminal, Oakland|Oakland, CA|US|R|BNSF, UP via OTR
US-RR030|Terminal, Port Hueneme|Port Hueneme, CA|US|R|UP via VCRR
US-RR031|San Bernardino|San Bernardino, CA|US|R|BNSF
US-RR032|West Basin Container Terminal (WBCT) - China Shipping Holding (Berths 100-109), San Pedro|San Pedro, CA|US|R|PHL
US-RR033|West Basin Container Terminal (WBCT) - Everglades Company Terminal (Berths 120-126), San Pedro|San Pedro, CA|US|R|PHL
US-RR034|Stockton|Stockton, CA|US|R|BNSF
US-RR035|APM Termianls Pacific (Berths 400-406), Terminal Island|Terminal Island, CA|US|R|PHL
US-RR036|Everport Terminal Services (Berths 226-236), Terminal Island|Terminal Island, CA|US|R|PHL
US-RR037|Fenix Marine Services (Berths 302-305), Terminal Island|Terminal Island, CA|US|R|PHL
US-RR038|Los Angeles, CA - Terminal Island Container Transfer Facility (TICTF)|Terminal Island, CA|US|R|PHL
US-RR039|Yusen Terminals (Berths 212-225), Terminal Island|Terminal Island, CA|US|R|PHL
US-RR040|Wilmington, CA - TraPac Intermodal Container Transfer Facility|Wilmington, CA|US|R|PHL
US-RR041|Denver|Denver, CO|US|R|UP
US-RR042|Denver, CO - Irondale|Denver, CO|US|R|BNSF
US-RR043|Marine Terminal, Wilmington|Wilmington, DE|US|R|NS
US-RR044|Cocoa|Cocoa, FL|US|R|FEC
US-RR045|Port of Fernandina, Fernandina Beach|Fernandina Beach, FL|US|R|CSX via FCRD
US-RR046|Fort Lauderdale, FL - Intermodal Container Transfer Facility (ICTF)|Fort Lauderdale, FL|US|R|FEC
US-RR047|Fort Lauderdale, Ft. Lauderdale|Ft. Lauderdale, FL|US|R|CSX, FEC
US-RR048|Fort Pierce, Ft. Pierce|Ft. Pierce, FL|US|R|CSX, FEC
US-RR049|Blount Island Marine Terminal, Jacksonville|Jacksonville, FL|US|R|CSX
US-RR050|Dames Point ICTF (JaxPort), Jacksonville|Jacksonville, FL|US|R|CSX
US-RR051|Dames Point Marine Terminal, Jacksonville|Jacksonville, FL|US|R|CSX
US-RR052|Jacksonville|Jacksonville, FL|US|R|CSX, NS
US-RR053|Jacksonville, FL - Fowden Intermodal Terminal|Jacksonville, FL|US|R|FEC
US-RR054|Talleyrand Intermodal Container Transfer Facility (ICTF), Jacksonville|Jacksonville, FL|US|R|CSX, NS via JXPT
US-RR055|Talleyrand Marine Terminal, Jacksonville|Jacksonville, FL|US|R|CSX, NS via FEC, JXPT
US-RR056|Miami, FL - Port of Miami Terminal Operating Company (POMTOC)|Miami, FL|US|R|CSX, FEC
US-RR057|Miami, Miami Springs|Miami Springs, FL|US|R|CSX, FEC
US-RR058|West Terminal, Panama City|Panama City, FL|US|R|CSX, NS via BAYL
US-RR059|Palm Beach Terminal, Riviera Beach|Riviera Beach, FL|US|R|CSX, NS via FEC
US-RR060|Hooker's Point Container Terminal, Tampa|Tampa, FL|US|R|CSX
US-RR061|Tampa|Tampa, FL|US|R|CSX
US-RR062|Winter Haven, FL - Central Florida Intermodal Logistics Center (CFILC)|Winter Haven, FL|US|R|CSX, EVWR
US-RR063|Atlanta, GA - Hulsey|Atlanta, GA|US|R|CSX
US-RR064|Atlanta, GA - Inman|Atlanta, GA|US|R|NS
US-RR065|Atlanta, GA - Austell|Austell, GA|US|R|NS
US-RR066|Appalachian Regional Port (ARP), Crandall|Crandall, GA|US|R|CSX
US-RR067|Fairburn|Fairburn, GA|US|R|CSX, BNSF
US-RR068|Mason ICTF, Garden City|Garden City, GA|US|R|NS
US-RR069|Savannah Gateway Industrial Hub, Rincon|Rincon, GA|US|R|CSX, NS via SIT (OmniTRAX)
US-RR070|Chatham ICTF, Savannah|Savannah, GA|US|R|CSX
US-RR071|Garden City Marine Terminal, Savannah|Savannah, GA|US|R|CSX, NS via SAPT
US-RR072|Ocean Terminal, Savannah|Savannah, GA|US|R|CSX, NS
US-RR073|Savannah|Savannah, GA|US|R|CSX
US-RR074|Council Bluffs|Council Bluffs, IA|US|R|UP, IAIS
US-RR075|Butler Intermodal Terminal, Shell Rock|Shell Rock, IA|US|R|UP via INAR
US-RR076|Chicago, IL - Bedford Park|Bedford Park, IL|US|R|CSX
US-RR077|Blue Island|Blue Island, IL|US|R|IAIS
US-RR078|Chicago, IL - 14th Street (Global I)|Chicago, IL|US|R|UP
US-RR079|Chicago, IL - 47th Street|Chicago, IL|US|R|NS
US-RR080|Chicago, IL - 59th Street|Chicago, IL|US|R|CSX
US-RR081|Chicago, IL - 63rd Street|Chicago, IL|US|R|NS
US-RR082|Chicago, IL - Calumet|Chicago, IL|US|R|NS
US-RR083|Chicago, IL - Corwith|Chicago, IL|US|R|BNSF
US-RR084|Chicago, IL - Landers|Chicago, IL|US|R|NS
US-RR085|Chicago, IL - Cicero|Cicero, IL|US|R|BNSF
US-RR086|Decatur, IL - ADM Intermodal Ramp (Midwest Inland Port)|Decatur, IL|US|R|NS, CSX, CN
US-RR087|Chiacgo, IL - Dolton (Yard Center)|Dolton, IL|US|R|UP
US-RR088|Dupo, IL - St. Louis|Dupo, IL|US|R|UP
US-RR089|East St. Louis|East St. Louis, IL|US|R|CSX
US-RR090|Chicago, IL - Logistics Park Chicago (LPC), Elwood|Elwood, IL|US|R|BNSF
US-RR091|Chicago, IL - Franklin Park (Bensenville Intermodal Terminal)|Franklin Park, IL|US|R|CP
US-RR092|Chicago, IL - Harvey (Gateway)|Harvey, IL|US|R|CN
US-RR093|Chicago, IL - Willow Springs, Hodgkins|Hodgkins, IL|US|R|BNSF
US-RR094|Chicago, IL - Joliet (Global IV)|Joliet, IL|US|R|UP
US-RR095|Joliet|Joliet, IL|US|R|CN
US-RR096|Chiacgo, IL - Northlake (Global II)|Northlake, IL|US|R|UP
US-RR097|Chicago, IL - Rochelle (Global III)|Rochelle, IL|US|R|UP
US-RR098|Chicago, IL - Schiller Park|Schiller Park, IL|US|R|CP
US-RR099|Indianapolis, IN - Plainfield Intermodal Terminal, Avon|Avon, IN|US|R|CSX
US-RR100|Indianapolis|Indianapolis, IN|US|R|CN, INRD
US-RR101|Kansas City - Logistics Park Kansas City (LPKC), Edgerton|Edgerton, KS|US|R|BNSF
US-RR102|Georgetown|Georgetown, KY|US|R|NS
US-RR103|Louisville|Louisville, KY|US|R|CSX
US-RR104|Louisville, KY - Appliance Park|Louisville, KY|US|R|NS
US-RR105|Louisville, KY - Buechel|Louisville, KY|US|R|NS
US-RR106|New Orleans, Avondale|Avondale, LA|US|R|UP
US-RR107|New Orleans, Harahan|Harahan, LA|US|R|CN
US-RR108|New Orleans|New Orleans, LA|US|R|NS
US-RR109|General Cargo Dock, Shreveport|Shreveport, LA|US|R|KCS, UP
US-RR110|New Orleans, Westwego|Westwego, LA|US|R|BNSF
US-RR111|Ayer|Ayer, MA|US|R|NS, ST
US-RR112|Springfield, West Springfield|West Springfield, MA|US|R|CSX
US-RR113|Stackbridge, Worcester|Worcester, MA|US|R|CSX
US-RR114|Worcester|Worcester, MA|US|R|CSX
US-RR115|Baltimore|Baltimore, MD|US|R|NS
US-RR116|Baltimore, MD - Seagirt Marine Terminal|Baltimore, MD|US|R|CSX
US-RR117|Detroit|Detroit, MI|US|R|CSX
US-RR118|Detroit, MI - Delray|Detroit, MI|US|R|NS
US-RR119|Detroit, MI - Detroit Intermodal Terminal|Detroit, MI|US|R|CP
US-RR120|Detroit, MI - Livernois|Detroit, MI|US|R|NS
US-RR121|Detroit, MI - Moterm Intermodal Facility (MOT), Ferndale|Ferndale, MI|US|R|CN
US-RR122|CN Duluth Intermodal Terminal|Duluth, MN|US|R|CN
US-RR123|Minneapolis, MN - Shoreham Yard|Minneapolis, MN|US|R|CP
US-RR124|St. Paul, MN - Midway|St. Paul, MN|US|R|BNSF
US-RR125|Kansas City|Kansas City, MO|US|R|NS, UP
US-RR126|Kansas City, MO - International Freight Gateway (IFG)|Kansas City, MO|US|R|CSX, KCS
US-RR127|St. Louis|St. Louis, MO|US|R|NS
US-RR128|St. Louis, MO - Lindenwood|St. Louis, MO|US|R|BNSF
US-RR129|Port Bienville Industrial Park, Bay St Louis|Bay St Louis, MS|US|R|CSX via PBVR
US-RR130|Terminal, Fulton|Fulton, MS|US|R|MSRW
US-RR131|Deep Water Port (West Pier Terminal), Gulfport|Gulfport, MS|US|R|KCS
US-RR132|Terminal, Iuka|Iuka, MS|US|R|KCS, NS
US-RR133|Terminal, Natchez|Natchez, MS|US|R|NTZR
US-RR134|Jackson, Richland|Richland, MS|US|R|KCS, CN
US-RR135|Charlotte Inland Port (CIP)|Charlotte, NC|US|R|CSX via Queen City Express
US-RR136|Charlotte|Charlotte, NC|US|R|CSX, NS
US-RR137|Greensboro|Greensboro, NC|US|R|NS
US-RR138|Container Terminal (South Gate), Wilmington|Wilmington, NC|US|R|CSX via WTRY
US-RR139|Omaha|Omaha, NE|US|R|BNSF
US-RR140|Balzano Marine Terminal, Camden|Camden, NJ|US|R|Conrail, CSX, NS
US-RR141|Erail, Elizabeth|Elizabeth, NJ|US|R|NS
US-RR142|Croxton, Jersey City|Jersey City, NJ|US|R|NS
US-RR143|GCT Bayonne Terminal, Jersey City|Jersey City, NJ|US|R|CSX, NS
US-RR144|Kearny|Kearny, NJ|US|R|CSX
US-RR145|Port Newark Container Terminal, NJ - ExpressRail (Newark)|Newark, NJ|US|R|CSX
US-RR146|Little Ferry, North Bergen|North Bergen, NJ|US|R|CSX
US-RR147|North Bergen|North Bergen, NJ|US|R|CSX
US-RR148|Elizabeth Marine Terminal, NJ - ExpressRail (Port Elizabeth)|Port Elizabeth, NJ|US|R|CSX, NS
US-RR149|Salem Marine Terminal (SMT)|Salem, NJ|US|R|CSX, NS
US-RR150|Albuquerque|Albuquerque, NM|US|R|BNSF
US-RR151|Santa Teresa|Santa Teresa, NM|US|R|UP
US-RR152|Las Vegas|Las Vegas, NV|US|R|UP
US-RR153|Sparks|Sparks, NV|US|R|UP
US-RR154|Buffalo, Blasdell|Blasdell, NY|US|R|CSX
US-RR155|Red Hook Container Terminal, Brooklyn|Brooklyn, NY|US|R|CSX, NS
US-RR156|Buffalo|Buffalo, NY|US|R|NS
US-RR157|Albany, NY - Mechanicville|Mechanicville, NY|US|R|NS
US-RR158|GCT New York, NY - ExpressRail (Staten Island)|Staten Island, NY|US|R|CSX, NS
US-RR159|Syracuse|Syracuse, NY|US|R|CSX
US-RR160|Cincinnati, OH - Gest Street|Cincinnati, OH|US|R|NS
US-RR161|Cincinnati, OH - Queensgate Yard|Cincinnati, OH|US|R|CSX
US-RR162|Cleveland, OH - Collinwood Yard|Cleveland, OH|US|R|CSX
US-RR163|Columbus|Columbus, OH|US|R|NS
US-RR164|Columbus, OH - Buckeye Yard|Columbus, OH|US|R|CSX
US-RR165|Marion, OH - Ohio Valley Intermodal Facility|Marion, OH|US|R|CSX, KCS
US-RR166|North Baltimore, OH - Northwest Ohio ICTF|North Baltimore, OH|US|R|CSX
US-RR167|Cincinnati, OH - Sharonville|Sharonville, OH|US|R|NS
US-RR168|Toledo|Toledo, OH|US|R|NS
US-RR169|Port Westward Industrial Park, Clatskanie|Clatskanie, OR|US|R|BNSF via PNWR
US-RR170|Portland, OR - Brooklyn|Portland, OR|US|R|UP
US-RR171|Portland, OR - Terminal 2 (Guilds Lake)|Portland, OR|US|R|BNSF, UP
US-RR172|Portland, OR - Terminal 6|Portland, OR|US|R|BNSF
US-RR173|Bethlehem|Bethlehem, PA|US|R|NS
US-RR174|Chambersburg|Chambersburg, PA|US|R|CSX
US-RR175|Morrisville, East Langhorne|East Langhorne, PA|US|R|NS
US-RR176|Greencastle, PA - Franklin County Regional Intermodal Facility|Greencastle, PA|US|R|NS
US-RR177|Harrisburg|Harrisburg, PA|US|R|NS
US-RR178|Rutherford, Harrisburg|Harrisburg, PA|US|R|NS
US-RR179|Pittsburgh, PA - McKees Rocks|McKees Rocks, PA|US|R|CSX
US-RR180|Philadelphia, PA - Greenwhich|Philadelphia, PA|US|R|CSX, CP, NS
US-RR181|Taylor|Taylor, PA|US|R|NS
US-RR182|Pittsburgh, Wall|Wall, PA|US|R|NS
US-RR183|Inland Port Dillon|Dillon, SC|US|R|CSX
US-RR184|Inland Port Greer|Greer, SC|US|R|NS
US-RR185|Wando Welch Terminal, Mt. Pleasant|Mt. Pleasant, SC|US|R|CSX, NS
US-RR186|Charleston, North Charleston|North Charleston, SC|US|R|CSX
US-RR187|Hugh K. Leatherman Terminal, North Charleston|North Charleston, SC|US|R|CSX, NS
US-RR188|North Charleston Terminal|North Charleston, SC|US|R|CSX, NS via Palmetto Railways
US-RR189|Memphis|Memphis, TN|US|R|BNSF, CSX, CN
US-RR190|Nashville|Nashville, TN|US|R|CSX
US-RR191|Memphis, TN - Rossville|Rossville, TN|US|R|NS
US-RR192|Houston, TX - Kendleton, Beasley|Beasley, TX|US|R|KCS
US-RR193|Terminal, Brownsville|Brownsville, TX|US|R|KCS, BNSF via BRG
US-RR194|Donna, TX - Rio Valley|Donna, TX|US|R|UP
US-RR195|El Paso|El Paso, TX|US|R|BNSF
US-RR196|Velasco Container Terminal, Freeport|Freeport, TX|US|R|UP
US-RR197|Alliance, Haslet|Haslet, TX|US|R|BNSF
US-RR198|Houston, TX - Englewood (Wallisville Rd)|Houston, TX|US|R|UP
US-RR199|Houston, TX - Pearland|Houston, TX|US|R|BNSF
US-RR200|Houston, TX - Settegast (Kirkpatrick, Blvd)|Houston, TX|US|R|UP
US-RR201|Jacintoport Terminal, Houston|Houston, TX|US|R|BNSF, UP via PTRA
US-RR202|Barbours Cut Container Terminal, La Porte|La Porte, TX|US|R|BNSF, UP via PTRA
US-RR203|Laredo|Laredo, TX|US|R|KCS, UP
US-RR204|Long Mott Harbor|Long Mott, TX|US|R|BNSF, UP
US-RR205|Dallas, TX - Mesquite|Mesquite, TX|US|R|UP
US-RR206|Bayport Container Terminal, Pasadena|Pasadena, TX|US|R|UP
US-RR207|General Cargo Dock, Point Comfort|Point Comfort, TX|US|R|UP via PCN
US-RR208|San Antonio, TX - SAIT, Von Ormy|Von Ormy, TX|US|R|UP
US-RR209|Dallas, TX - Wilmer (Dallas Intermodal Terminal)|Wilmer, TX|US|R|UP
US-RR210|Wylie|Wylie, TX|US|R|KCS
US-RR211|Salt Lake City|Salt Lake City, UT|US|R|UP
US-RR212|Norfolk, VA - Portlock, Chesapeake|Chesapeake, VA|US|R|NS
US-RR213|Front Royal, VA - Virginia Inland Port (VIP)|Front Royal, VA|US|R|NS
US-RR214|Norfolk International Terminals (NIT)|Norfolk, VA|US|R|CSX, NS via NPBL
US-RR215|Portsmouth Empty Container Yard (PPCY)|Portsmouth, VA|US|R|CSX, NS via NPBL
US-RR216|Portsmouth|Portsmouth, VA|US|R|CSX
US-RR217|Virginia International Gateway (VIG), Portsmouth|Portsmouth, VA|US|R|CSX, NS via CWRY
US-RR218|Richmond Marine Termianl (RMT)|Richmond, VA|US|R|CSX, NS
US-RR219|Seaport, Olympia|Olympia, WA|US|R|BNSF, UP via OYLO
US-RR220|ARGO Yard, Seattle|Seattle, WA|US|R|UP
US-RR221|Seattle International Gateway (SIG)|Seattle, WA|US|R|BNSF
US-RR222|Seattle, WA - South Seattle|Seattle, WA|US|R|BNSF
US-RR223|Terminal 115 (T-115), Seattle|Seattle, WA|US|R|BNSF via TMBL
US-RR224|Terminal 18 (T-18), Seattle|Seattle, WA|US|R|BNSF, UP
US-RR225|Terminal 30 (T-30), Seattle|Seattle, WA|US|R|BNSF (SIG Yard), UP (Argo Yard)
US-RR226|Terminal 5, Seattle|Seattle, WA|US|R|BNSF, UP
US-RR227|Spokane|Spokane, WA|US|R|BNSF
US-RR228|East Sitcum Terminal, Tacoma|Tacoma, WA|US|R|North Intermodal Yard (NIM) - BNSF, UP via TMBL
US-RR229|Husky Terminal, Tacoma|Tacoma, WA|US|R|North Intermodal Yard (NIM) - BNSF, UP via TMBL
US-RR230|Pierce County Terminal (PCT), Tacoma|Tacoma, WA|US|R|PCT Intermodal Yard - BNSF, UP
US-RR231|Tacoma South Intermodal Yard (TacSIM)|Tacoma, WA|US|R|UP
US-RR232|Tacoma, WA - North Yard|Tacoma, WA|US|R|BNSF
US-RR233|Washington United Terminals (WUT), Tacoma|Tacoma, WA|US|R|Hyundai Intermodal Yard (HIM) via BNSF, UP
US-RR234|West Sitcum Terminal, Tacoma|Tacoma, WA|US|R|South Intermodal Yard (SIM) - UP
US-RR235|Arcadia|Arcadia, WI|US|R|CN
US-RR236|Chippewa Falls|Chippewa Falls, WI|US|R|CN
`;
