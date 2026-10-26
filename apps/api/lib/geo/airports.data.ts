// IATA-coded airports (large, medium and small), one per line: CODE|Airport name|City served|Country code|
// size + scheduled service (L/M/S, 1/0). From world_airports_iata.xlsx, an OurAirports open-data
// snapshot of 26 October 2026 (public domain) - not IATA's official licensed database.
// Regenerate from a fresh workbook rather than editing by hand.
export const AIRPORTS_DATA = `
AAA|Anaa Airport|Anaa|PF|M1
AAB|Arrabury Airport|Tanbar|AU|S0
AAC|El Arish International Airport|El Arish|EG|L1
AAD|Adado Airport|Adado|SO|S0
AAE|Annaba Rabah Bitat Airport|Annaba|DZ|L1
AAF|Apalachicola Regional Airport|Apalachicola|US|S0
AAH|Aachen-Merzbrück Airport|Aachen|DE|S0
AAI|Arraias Airport|Arraias|BR|S0
AAJ|Cayana Airstrip|Awaradam|SR|S0
AAK|Aranuka Airport|Buariki|KI|S1
AAL|Aalborg Airport|Aalborg|DK|L1
AAM|Malamala Airport|Malamala|ZA|M0
AAN|Al Ain International Airport|Al Ain|AE|L1
AAO|Anaco Airport|Anaco|VE|M0
AAP|Aji Pangeran Tumenggung Pranoto International Airport|Samarinda|ID|M1
AAQ|Anapa Vityazevo Airport|Krasnyi Kurgan|RU|M0
AAR|Aarhus Airport|Aarhus|DK|L1
AAS|Apalapsili Airport|Apalapsili|ID|S0
AAT|Altay Xuedu Airport|Altay|CN|M1
AAU|Asau Airport|Asau|WS|S0
AAV|Allah Valley Airport|Surallah|PH|M0
AAX|Romeu Zema Airport|Araxá|BR|M1
AAY|Al Ghaydah International Airport|Al Ghaydah|YE|M1
AAZ|Quezaltenango Airport|Quezaltenango|GT|S1
ABA|Abakan International Airport|Abakan|RU|L1
ABB|Asaba International Airport|Asaba|NG|L1
ABC|Albacete Airport / Los Llanos Air Base|Albacete|ES|M0
ABD|Abadan Ayatollah Jami International Airport|Abadan|IR|L1
ABE|Lehigh Valley International Airport|Allentown/Bethlehem|US|M1
ABF|Abaiang Airport|Abaiang|KI|S0
ABG|Abingdon Downs Airport|Abingdon Downs|AU|S0
ABH|Alpha Airport|Alpha|AU|S0
ABI|Abilene Regional Airport|Abilene|US|M1
ABJ|Félix-Houphouët-Boigny International Airport|Abidjan|CI|L1
ABK|Kebri Dahar Airport|Kebri Dahar|ET|M1
ABL|Ambler Airport|Ambler|US|M1
ABM|Northern Peninsula Airport|Bamaga|AU|S1
ABN|Albina Airport|Albina|SR|S0
ABO|Aboisso Airport|Aboisso|CI|S0
ABP|Atkamba Airport|Atkamba Mission|PG|S0
ABQ|Albuquerque International Sunport|Albuquerque|US|L1
ABR|Aberdeen Regional Airport|Aberdeen|US|M1
ABS|Abu Simbel Airport|Abu Simbel|EG|M1
ABT|King Saud Bin Abdulaziz (Al Baha) Airport|Al-Baha|SA|M1
ABU|AA Bere Tallo (Haliwen) Airport|Atambua|ID|S1
ABV|Nnamdi Azikiwe International Airport|Abuja|NG|L1
ABX|Albury Airport|East Albury|AU|M1
ABY|Southwest Georgia Regional Airport|Albany|US|M1
ABZ|Aberdeen International Airport|Aberdeen|GB|L1
ACA|General Juan N. Álvarez International Airport|Acapulco|MX|L1
ACB|Antrim County Airport|Bellaire|US|S0
ACC|Kotoka International Airport|Accra|GH|L1
ACD|Alcides Fernández Airport|Acandí|CO|S0
ACE|César Manrique-Lanzarote Airport|San Bartolomé|ES|L1
ACF|Aral Tarim Airport|Aral|CN|S1
ACH|Sankt Gallen Altenrhein Airport|St. Gallen|CH|M1
ACI|Alderney Airport|Saint Anne|GG|M1
ACJ|Anuradhapura Airport|Anuradhapura|LK|M0
ACK|Nantucket Memorial Airport|Nantucket|US|M1
ACM|Arica Airport|Arica|CO|S0
ACN|Ciudad Acuña International Airport|Ciudad Acuña|MX|M0
ACO|Cóbano Airport|Cóbano|CR|S0
ACP|Sahand Airport|Maragheh|IR|S0
ACR|Araracuara Airport|Araracuara|CO|S0
ACS|Achinsk Airport|Achinsk|RU|M0
ACT|Waco Regional Airport|Waco|US|M1
ACU|Achutupu Airport|Mamitupu|PA|S0
ACV|California Redwood Coast-Humboldt County Airport|Arcata/Eureka|US|M1
ACX|Xingyi Wanfenglin Airport|Xingyi|CN|M1
ACY|Atlantic City International Airport|Atlantic City|US|M1
ACZ|Zabol Airport|Zabol|IR|M0
ADA|Adana Şakirpaşa Airport|Seyhan|TR|S0
ADB|Adnan Menderes International Airport|Gaziemir|TR|L1
ADC|Andakombe Airport|Andekombe|PG|S0
ADD|Addis Ababa Bole International Airport|Addis Ababa|ET|L1
ADE|Aden International Airport|Aden|YE|L1
ADF|Adıyaman Airport|Adıyaman|TR|M1
ADG|Lenawee County Airport|Adrian|US|S0
ADH|Aldan Airport|Aldan|RU|S0
ADI|Arandis Airport|Arandis|NA|M0
ADJ|Marka International (Amman Civil) Airport|Amman|JO|L1
ADK|Adak Airport|Adak|US|M1
ADL|Adelaide International Airport|Adelaide|AU|L1
ADM|Ardmore Municipal Airport|Ardmore|US|S0
ADO|Andamooka Airport|Andamooka|AU|S0
ADP|Ampara Airport|Ampara|LK|M0
ADQ|Kodiak Airport|Kodiak|US|M1
ADR|Robert F Swinnie Airport|Andrews|US|S0
ADS|Addison Airport|Dallas|US|S0
ADT|Ada Regional Airport|Ada|US|M0
ADU|Ardabil Airport|Ardabil|IR|M1
ADV|El Daein Airport|El Daein|SD|S0
ADW|Joint Base Andrews|Camp Springs|US|M0
ADX|Leuchars Station Airfield|Leuchars, Fife|GB|M0
ADY|Alldays Airport|Alldays|ZA|S0
ADZ|Gustavo Rojas Pinilla International Airport|San Andrés|CO|L1
AEA|Abemama Airport|Abemama|KI|S0
AEB|Baise (Bose) Bama Airport|Baise (Tianyang)|CN|M1
AEE|Adareil Airport|Adar|SS|S0
AEG|Aek Godang Airport|Padang Sidempuan|ID|M0
AEH|Abeche Airport|Abeche|TD|M0
AEK|Aseki Airport|Aseki|PG|S0
AEL|Albert Lea Municipal Airport|Albert Lea|US|S0
AEM|Amgu Airport|Amgu|RU|S0
AEO|Aioun el Atrouss Airport|Aioun El Atrouss|MR|S0
AEP|Aeroparque Jorge Newbery|Buenos Aires|AR|L1
AEQ|Ar Horqin Airport|Chifeng|CN|S0
AER|Sochi International Airport|Sochi|RU|L1
AES|Ålesund Airport|Ålesund|NO|L1
AET|Allakaket Airport|Allakaket|US|S1
AEU|Abu Musa Island Airport|Abu Musa|IR|M1
AEX|Alexandria International Airport|Alexandria|US|M1
AEY|Akureyri International Airport|Akureyri|IS|L1
AFA|Suboficial Ay Santiago Germano Airport|San Rafael|AR|M1
AFD|Port Alfred Airport|Port Alfred|ZA|S0
AFF|USAF Academy Airfield|Colorado Springs|US|S0
AFI|Amalfi Airport|Amalfi|CO|S0
AFL|Piloto Osvaldo Marques Dias Airport|Alta Floresta|BR|M1
AFN|Jaffrey Airfield Silver Ranch Airport|Jaffrey|US|S0
AFO|Afton Municipal Airport|Afton|US|S0
AFR|Afore Airstrip|Afore|PG|S0
AFS|Sugraly Airport|Zarafshan|UZ|S0
AFT|Afutara Aerodrome|Bila|SB|S0
AFW|Perot Field/Fort Worth Alliance Airport|Fort Worth|US|M0
AFY|Afyon Air Base|Afyonkarahisar|TR|M0
AFZ|Sabzevar National Airport|Sabzevar|IR|M1
AGA|Al Massira Airport|Agadir (Temsia)|MA|L1
AGB|Augsburg Airport|Augsburg|DE|M0
AGC|Allegheny County Airport|Pittsburgh|US|M0
AGD|Anggi Airport|Anggi-Papua Island|ID|S0
AGE|Wangerooge Airport|Wangerooge|DE|S1
AGF|Agen La Garenne airport|Agen|FR|M0
AGG|Angoram Airport|Angoram|PG|S0
AGH|Ängelholm-Helsingborg Airport|Ängelholm|SE|M1
AGI|Wageningen Airstrip|Wageningen|SR|S1
AGJ|Aguni Airport|Aguni|JP|S1
AGK|Kagua Airport|Kagua|PG|S0
AGL|Wanigela Airport|Wanigela|PG|S0
AGO|Magnolia Municipal Airport / Ralph C Weiser Field|Magnolia|US|S0
AGP|Málaga-Costa del Sol Airport|Málaga|ES|L1
AGR|Agra Airport / Agra Air Force Station|Agra|IN|M1
AGS|Augusta Regional At Bush Field|Augusta|US|M1
AGT|Guaraní International Airport|Ciudad del Este|PY|L1
AGU|Aguascalientes International Airport|Aguascalientes|MX|L1
AGV|Oswaldo Guevara Mujica Airport|Acarigua|VE|M0
AGW|Agnew Airport|Agnew|AU|S0
AGX|Agatti Airport|Agatti|IN|M1
AGZ|Aggeneys Airport|Aggeneys|ZA|M0
AHA|Maa Mahamaya Airport|Ambikapur|IN|M1
AHB|Abha International Airport|Abha|SA|L1
AHC|Amedee Army Air Field|Herlong|US|S0
AHD|Ardmore Downtown Executive Airport|Ardmore|US|S0
AHE|Ahe Airport|Ahe Atoll|PF|M1
AHF|Arapahoe Municipal Airport|Arapahoe|US|S0
AHG|Agalega Island Airstrip|Vingt Cinq|MU|S0
AHH|Amery Municipal Airport|Amery|US|S0
AHI|Amahai Airport|Amahai|ID|S0
AHJ|Hongyuan Airport|Ngawa (Hongyuan)|CN|M0
AHL|Aishalton Airport|Aishalton|GY|S0
AHM|Ashland Municipal Airport Sumner Parker Field|Ashland|US|S0
AHN|Athens Ben Epps Airport|Athens|US|M0
AHO|Alghero-Fertilia Airport|Alghero|IT|M1
AHS|Ahuas Airport|Ahuas|HN|S0
AHU|Cherif Al Idrissi Airport|Al Hoceima|MA|M1
AHY|Ambatolhy Airport|Ambatolahy|MG|S0
AHZ|L'Alpe d'Huez - Henri Giraud Altiport|Huez, Isère|FR|S0
AIA|Alliance Municipal Airport|Alliance|US|M1
AIC|Ailinglaplap Airok Airport|Bigatyelang Island|MH|S0
AID|Anderson Municipal Darlington Field|Anderson|US|S0
AIE|Aiome Airport|Aiome|PG|S0
AIF|Marcelo Pires Halzhausen Airport|Assis|BR|S0
AIG|Yalinga Airport|Yalinga|CF|S0
AIH|Aiambak Airport|Aiambak|PG|S0
AII|Ali-Sabieh Airport|Ali-Sabieh|DJ|S0
AIK|Aiken Regional Airport|Aiken|US|S0
AIL|Ailigandí Airport|Isla Lorenzo Bello|PA|S0
AIM|Ailuk Airport|Ailuk Island|MH|S0
AIN|Wainwright Airport|Wainwright|US|M1
AIO|Atlantic Municipal Airport|Atlantic|US|S0
AIP|Adampur Airport|Adampur|IN|S1
AIR|Aripuanã Airport|Aripuanã|BR|S0
AIS|Arorae Island Airport|Arorae Island|KI|S0
AIT|Aitutaki Airport|Aitutaki|CK|S1
AIU|Enua Airport|Atiu Island|CK|S1
AIV|George Downer Airport|Aliceville|US|S0
AIW|Ai-Ais Airport|Ai-Ais|NA|S0
AIY|Araçuaí Airport|Araçuaí|BR|S0
AIZ|Lee C Fine Memorial Airport|Kaiser Lake Ozark|US|S0
AJA|Ajaccio Napoléon Bonaparte airport|Ajaccio|FR|M1
AJF|Al-Jawf International Airport|Al-Jawf|SA|L1
AJI|Ağrı Airport|Ağrı|TR|M1
AJJ|Akjoujt Airport|Akjoujt|MR|S0
AJK|Arak Airport|Araak|IR|S0
AJL|Lengpui Airport|Aizawl (Lengpui)|IN|M1
AJN|Ouani Airport|Ouani|KM|M1
AJR|Arvidsjaur Airport|Arvidsjaur|SE|M1
AJS|Punta Abreojos Airport|Mulegé|MX|S0
AJU|Aracaju - Santa Maria Airport|Aracaju|BR|M1
AJY|Mano Dayak International Airport|Agadez|NE|M0
AKA|Ankang Fuqiang Airport|Ankang (Hanbin)|CN|S1
AKB|Atka Airport|Atka|US|S1
AKC|Akron Fulton International Airport|Akron|US|M0
AKD|Akola Airport|Akola|IN|M0
AKE|Akieni Airport|Akieni|GA|S0
AKF|Kufra Airport|Kufra|LY|M1
AKG|Anguganak Airport|Anguganak|PG|S0
AKH|Prince Sultan Air Base|Al Kharj|SA|M0
AKI|Akiak Airport|Akiak|US|S1
AKJ|Asahikawa Airport|Higashikagura|JP|M1
AKK|Akhiok Airport|Akhiok|US|S1
AKL|Auckland International Airport|Auckland|NZ|L1
AKM|Zakuoma Airport|ZaKouma|TD|S0
AKN|King Salmon Airport|King Salmon|US|M1
AKO|Colorado Plains Regional Airport|Akron|US|S0
AKP|Anaktuvuk Pass Airport|Anaktuvuk Pass|US|M1
AKQ|Astra Ksetra Airport|Menggala|ID|S0
AKR|Akure Airport|Akure|NG|M1
AKS|Gwaunaru'u Airport|Auki|SB|S1
AKT|RAF Akrotiri|Akrotiri|CY|M0
AKU|Aksu Hongqipo Airport|Aksu (Onsu)|CN|M1
AKV|Akulivik Airport|Akulivik|CA|S1
AKW|Aghajari Airport|Omidiyeh|IR|M0
AKX|Aktobe International Airport|Aktobe|KZ|L1
AKY|Sittwe Airport|Sittwe|MM|M1
ALA|Almaty International Airport|Almaty|KZ|L1
ALB|Albany International Airport|Albany|US|L1
ALC|Alicante-Elche Miguel Hernández Airport|Alicante|ES|L1
ALD|Alerta Airport|Fortaleza|PE|S0
ALE|Alpine Casparis Municipal Airport|Alpine|US|S0
ALF|Alta Airport|Alta|NO|M1
ALG|Houari Boumediene Airport|Algiers|DZ|L1
ALH|Albany Airport|Albany|AU|M1
ALI|Alice International Airport|Alice|US|M0
ALJ|Alexander Bay Airport|Alexander Bay|ZA|M0
ALM|Alamogordo White Sands Regional Airport|Alamogordo|US|M0
ALN|St Louis Regional Airport|Alton/St Louis|US|M0
ALO|Waterloo Regional Airport|Waterloo|US|M1
ALP|Aleppo International Airport|Aleppo|SY|L1
ALQ|Alegrete Novo Airport|Alegrete|BR|S0
ALR|Alexandra Aerodrome|Alexandra|NZ|M0
ALS|San Luis Valley Regional Airport/Bergman Field|Alamosa|US|M1
ALT|Alenquer Municipal Airport|Alenquer|BR|S0
ALU|Alula Airport|Alula|SO|S0
ALW|Walla Walla Regional Airport|Walla Walla|US|M1
ALX|Thomas C Russell Field|Alexander City|US|S0
AMA|Rick Husband Amarillo International Airport|Amarillo|US|M1
AMB|Ambilobe Airport||MG|S0
AMC|Am Timan Airport|Am Timan|TD|S0
AMD|Sardar Vallabh Patel International Airport|Ahmedabad|IN|L1
AME|Alto Molocue Airport|Alto Molocue|MZ|S0
AMF|Ama Airport||PG|S0
AMH|Arba Minch Airport|Arba Minch|ET|M1
AMJ|Cirilo Queiróz Airport|Almenara|BR|S0
AMK|Animas Air Park|Durango|US|S0
AML|Puerto Armuelles Airport|Puerto Armuelles|PA|S0
AMM|Queen Alia International Airport|Amman|JO|L1
AMN|Gratiot Community Airport|Alma|US|S0
AMO|Mao Airport|Mao|TD|S0
AMP|Ampanihy Airport|Ampanihy|MG|S0
AMQ|Pattimura International Airport|Ambon|ID|L1
AMS|Amsterdam Airport Schiphol|Amsterdam|NL|L1
AMT|Amata Airport||AU|S0
AMU|Amanab Airport|Amanab|PG|S0
AMV|Amderma Airport|Amderma|RU|M1
AMW|Ames Municipal Airport|Ames|US|S0
AMX|Ammaroo Airport||AU|S0
AMY|Ambatomainty Airport||MG|S0
AMZ|Ardmore Airport|Manurewa|NZ|M0
ANA|Angama Mara Airport|Lolgorien|KE|S0
ANB|Anniston Regional Airport|Anniston|US|M0
ANC|Ted Stevens Anchorage International Airport|Anchorage|US|L1
AND|Anderson Regional Airport|Anderson|US|M0
ANE|Angers Marcé airport|Angers|FR|M0
ANF|Andrés Sabella Gálvez International Airport|Antofagasta|CL|L1
ANG|Angoulême Brie-Champniers airport|Angoulême|FR|M0
ANI|Aniak Airport|Aniak|US|M1
ANJ|Zanaga Airport|Zanaga|CG|S0
ANK|Etimesgut Air Base|Ankara|TR|M0
ANL|Andulo Airport|Andulo|AO|S0
ANM|Antsirabe Airport|Antsirabe|MG|M0
ANN|Annette Island Airport|Metlakatla|US|M0
ANO|Angoche Airport|Angoche|MZ|S0
ANP|Lee Airport|Annapolis|US|S0
ANQ|Tri State Steuben County Airport|Angola|US|S0
ANR|Antwerp International Airport (Deurne)|Antwerp|BE|M1
ANS|Andahuaylas Airport|Andahuaylas|PE|S1
ANU|V. C. Bird International Airport|Osbourn|AG|L1
ANV|Anvik Airport|Anvik|US|M1
ANW|Ainsworth Regional Airport|Ainsworth|US|S0
ANX|Andøya Airport, Andenes|Andenes|NO|M1
ANY|Anthony Municipal Airport|Anthony|US|S0
ANZ|Angus Downs Airport|Angus Downs Station|AU|S0
AOB|Annanberg Airport||PG|S0
AOC|Leipzig–Altenburg Airport|Nobitz|DE|M0
AOD|Abou-Deïa Airport|Abou-Deïa|TD|S0
AOE|Hasan Polatkan Airport|Eskişehir|TR|L1
AOG|Anshan Teng'ao Airport / Anshan Air Base|Anshan|CN|M1
AOH|Lima Allen County Airport|Lima|US|S0
AOI|Marche Airport|Falconara Marittima (AN)|IT|M1
AOJ|Aomori Airport|Aomori|JP|L1
AOK|Karpathos Airport|Karpathos Island|GR|M1
AOL|Paso De Los Libres Airport|Paso de los Libres|AR|M0
AOM|Adam Airport|Adam|OM|S0
AOO|Altoona Blair County Airport|Altoona|US|M1
AOP|Alferez FAP Alfredo Vladimir Sara Bauer Airport|Andoas|PE|S0
AOR|Sultan Abdul Halim Airport|Alor Satar|MY|M1
AOT|Aosta Corrado Gex Airport|Saint-Christophe (AO)|IT|M0
AOU|Attopeu Airport|Attopeu|LA|S0
APA|Centennial Airport|Denver|US|M0
APB|Apolo Airport|Apolo|BO|S0
APC|Napa County Airport|Napa|US|S0
APD|Arung Palakka Airport|Bone|ID|S0
APF|Naples Municipal Airport|Naples|US|M0
APG|Phillips Army Air Field|Aberdeen|US|M0
APH|Mary Walker LZ Airport|Bowling Green|US|S0
API|Gomez Nino Apiay Air Base|Apiay|CO|M0
APJ|Ali Pulan Airport|Burang Town|CN|M0
APK|Apataki Airport|Apataki|PF|S1
APL|Nampula Airport|Nampula|MZ|L1
APN|Alpena County Regional Airport|Alpena|US|M1
APO|Antonio Roldán Betancur Airport|Carepa|CO|M1
APP|Asapa Airport||PG|S0
APQ|Arapiraca Airport|Arapiraca|BR|S0
APR|April River Airport|April River|PG|S0
APS|Anápolis Airport|Anápolis|BR|S0
APT|Marion County Airport - Brown Field|Jasper|US|S0
APU|Captain João Busse Airport|Apucarana|BR|S0
APV|Apple Valley Airport|Apple Valley|US|S0
APW|Faleolo International Airport|Apia|WS|L1
APX|Arapongas Airport|Arapongas|BR|S0
APY|Alto Parnaíba Airport|Alto Parnaíba|BR|S0
APZ|Zapala Airport|Zapala|AR|M0
AQA|Araraquara Airport|Araraquara|BR|M1
AQB|Quiché Airport|Santa Cruz del Quiché|GT|S0
AQG|Anqing Tianzhushan Airport / Anqing North Air Base|Anqing|CN|M1
AQI|Qaisumah–Hafar Al-Batin International Airport|Qaisumah|SA|L1
AQJ|King Hussein International Airport|Aqaba|JO|L1
AQM|Ariquemes Airport|Ariquemes|BR|S0
AQP|Rodríguez Ballón International Airport|Arequipa|PE|L1
AQY|Girdwood-Alyeska Airport|Girdwood|US|S0
ARA|Acadiana Regional Airport|New Iberia|US|M0
ARB|Ann Arbor Municipal Airport|Ann Arbor|US|S0
ARC|Arctic Village Airport|Arctic Village|US|M1
ARD|Alor Island - Mali Airport|Kabola|ID|S1
ARE|Antonio Nery Juarbe Pol Airport|Arecibo|PR|M0
ARF|Acaricuara Airport|Acaricuara|CO|S0
ARG|Walnut Ridge Regional Airport|Walnut Ridge|US|S0
ARH|Talagi Airport|Archangelsk|RU|M1
ARI|Chacalluta International Airport|Arica|CL|M1
ARK|Arusha Airport|Arusha|TZ|M1
ARL|Arly Airport|Arly|BF|S0
ARM|Armidale Airport|Armidale|AU|M1
ARN|Stockholm-Arlanda Airport|Stockholm|SE|L1
ARO|Arboletes Airport|Arboletes|CO|S0
ARP|Aragip Airport||PG|S0
ARQ|El Troncal Airport|Arauquita|CO|S0
ARR|D. Casimiro Szlapelis Airport|Alto Rio Senguerr|AR|S0
ARS|Aragarças Airport|Aragarças|BR|S0
ART|Watertown International Airport|Watertown|US|M1
ARU|Araçatuba Airport|Araçatuba|BR|M1
ARV|Lakeland Airport Noble F Lee Memorial Field|Woodruff|US|S0
ARW|Arad International Airport|Arad|RO|M1
ARX|Aracati Dragão do Mar Regional Airport|Aracati|BR|M0
ARY|Ararat Airport|Ararat|AU|M0
ARZ|N'zeto Airport|N'zeto|AO|S0
ASA|Assab International Airport|Assab|ER|M0
ASB|Ashgabat International Airport|Ashgabat|TM|L1
ASC|Ascención de Guarayos Airport|Ascensión de Guarayos|BO|S0
ASD|Andros Town Airport|Andros Town|BS|M1
ASE|Aspen-Pitkin County Airport (Sardy Field)|Aspen|US|M1
ASF|Astrakhan Narimanovo Boris M. Kustodiev International Airport|Astrakhan|RU|L1
ASG|Ashburton Airport|Ashburton|NZ|S0
ASH|Nashua Airport / Boire Field|Nashua|US|S0
ASI|RAF Ascension Island|Cat Hill|SH|M1
ASJ|Amami Airport|Amami|JP|M1
ASK|Yamoussoukro International Airport|Yamoussoukro|CI|L0
ASL|Harrison County Airport|Marshall|US|S0
ASM|Asmara International Airport|Asmara|ER|M1
ASN|Talladega Municipal Airport|Talladega|US|S0
ASO|Asosa Airport|Asosa|ET|M1
ASP|Alice Springs Airport|Alice Springs|AU|M1
ASQ|Austin Airport|Austin|US|S0
ASR|Kayseri Erkilet International Airport|Kayseri|TR|L1
ASS|Arathusa Safari Lodge Airport|Arathusa|ZA|S0
AST|Astoria Regional Airport|Astoria|US|M0
ASU|Silvio Pettirossi International Airport|Asunción|PY|L1
ASV|Amboseli Airport|Ol Tukai|KE|M1
ASW|Aswan International Airport|Aswan|EG|L1
ASX|John F Kennedy Memorial Airport|Ashland|US|S0
ASY|Ashley Municipal Airport|Ashley|US|S0
ASZ|Asirim Airport||PG|S0
ATA|Comandante FAP German Arias Graziani Airport|Anta|PE|M0
ATB|Atbara Airport|Atbara|SD|S0
ATC|Arthur's Town Airport|Arthur's Town|BS|M1
ATD|Uru Harbour Airport|Atoifi|SB|S0
ATE|Antlers Municipal Airport|Antlers|US|S0
ATF|Chachoán Regional Airport|Ambato|EC|M0
ATG|Minhas Air Base|Kamra|PK|M0
ATH|Athens Eleftherios Venizelos International Airport|Spata-Artemida|GR|L1
ATI|Artigas International Airport|Artigas|UY|S0
ATJ|Antsirabe Airport|Antsirabe|MG|S0
ATK|Atqasuk Edward Burnell Sr Memorial Airport|Atqasuk|US|M1
ATL|Hartsfield Jackson Atlanta International Airport|Atlanta|US|L1
ATM|Altamira Interstate Airport|Altamira|BR|M1
ATN|Namatanai Airport|Namatanai|PG|S0
ATO|Ohio University Airport|Albany|US|S0
ATP|Aitape Airport|Aitape|PG|S0
ATQ|Sri Guru Ram Das Ji International Airport|Amritsar|IN|L1
ATR|Atar International Airport|Atar|MR|M0
ATS|Artesia Municipal Airport|Artesia|US|S0
ATT|Atmautluak Airport|Atmautluak|US|S1
ATU|Casco Cove Coast Guard Station|Attu|US|S0
ATV|Ati Airport|Ati|TD|S0
ATW|Appleton International Airport|Appleton|US|M1
ATX|Atbasar Airport|Atbasar|KZ|S0
ATY|Watertown Regional Airport|Watertown|US|M1
ATZ|Asyut International Airport|Asyut|EG|L1
AUA|Queen Beatrix International Airport|Oranjestad|AW|L1
AUC|Santiago Perez Airport|Arauca|CO|M1
AUD|Augustus Downs Airport||AU|S0
AUE|Abu Rudeis Airport|Ras Abu Rudeis|EG|S0
AUF|Auxerre Branches airport|Auxerre|FR|M0
AUG|Augusta State Airport|Augusta|US|M1
AUH|Zayed International Airport|Abu Dhabi|AE|L1
AUI|Aua Island Airport|Aua Island|PG|S0
AUJ|Ambunti Airport|Ambunti|PG|S0
AUK|Alakanuk Airport|Alakanuk|US|S1
AUL|Aur Island Airport|Aur Atoll|MH|S1
AUM|Austin Municipal Airport|Austin|US|S0
AUN|Auburn Municipal Airport|Auburn|US|S0
AUO|Auburn University Regional Airport|Auburn|US|S0
AUP|Agaun Airport|Agaun|PG|S0
AUQ|Hiva Oa-Atuona Airport|Hiva Oa Island|PF|M1
AUR|Aurillac airport|Aurillac|FR|M1
AUS|Austin Bergstrom International Airport|Austin|US|L1
AUT|Atauro Airport|Vila|TL|S0
AUU|Aurukun Airport|Aurukun|AU|S1
AUV|Aumo Airport|Aumo|PG|S0
AUW|Wausau Downtown Airport|Wausau|US|M0
AUX|Araguaína Airport|Araguaína|BR|M1
AUY|Aneityum Airport|Anatom Island|VU|S0
AUZ|Aurora Municipal Airport|Chicago/Aurora|US|S0
AVA|Anshun Huangguoshu Airport|Anshun (Xixiu)|CN|M1
AVB|Aviano Air Base|Aviano (PN)|IT|M0
AVG|Auvergne Airport|Auvergne Station|AU|S0
AVI|Máximo Gómez Airport|Ciro Redondo|CU|M0
AVK|Arvaikheer Airport|Arvaikheer|MN|M1
AVL|Asheville Regional Airport|Asheville|US|M1
AVN|Avignon Caumont airport|Avignon|FR|M1
AVO|Avon Park Executive Airport|Avon Park|US|S0
AVP|Wilkes-Barre/Scranton International Airport|Wilkes-Barre/Scranton|US|M1
AVR|Amravati  Airport|Amravati|IN|M1
AVU|Avu Avu Airport|Avu Avu|SB|S0
AVV|Melbourne Avalon International Airport|Geelong/Melbourne|AU|L1
AVW|Marana Regional Airport|Marana|US|S0
AVX|Catalina Airport|Avalon|US|S0
AWA|Hawassa International Airport|Hawassa|ET|L1
AWB|Awaba Airport|Awaba|PG|S0
AWD|Aniwa Airport|Aniwa|VU|S0
AWE|Alowe Airport|Wonga Wongué Presidential Reserve|GA|S0
AWK|Wake Island Airfield|Wake Island|UM|M1
AWM|West Memphis Municipal Airport|West Memphis|US|S0
AWN|Alton Downs Airport||AU|S0
AWP|Austral Downs Airport||AU|S0
AWR|Awar Airport (unusable)|Awar|PG|S0
AWZ|Qasem Soleimani International Airport|Ahvaz|IR|L1
AXA|Clayton J. Lloyd International Airport|The Valley|AI|M1
AXB|Maxson Airfield|Alexandria Bay|US|S0
AXC|Aramac Airport||AU|S0
AXD|Alexandroupoli Democritus Airport|Alexandroupolis|GR|M1
AXE|Xanxerê Airport|Xanxerê|BR|S0
AXF|Alxa Left Banner Bayanhot Airport|Bayanhot|CN|M1
AXG|Algona Municipal Airport|Algona|US|S0
AXJ|Amakusa Airport|Amakusa|JP|M1
AXK|Ataq Airport|Ataq|YE|M0
AXL|Alexandria Homestead Airport||AU|S0
AXM|El Eden Airport|Armenia|CO|M1
AXN|Chandler Field|Alexandria|US|M0
AXO|Pantar Kabir Airport|Kabir|ID|S0
AXP|Spring Point Airport|Spring Point|BS|M1
AXR|Arutua Airport||PF|M1
AXS|Altus Quartz Mountain Regional Airport|Altus|US|S0
AXT|Akita Airport|Akita|JP|M1
AXU|Axum Airport|Axum|ET|M1
AXV|Neil Armstrong Airport|Wapakoneta|US|S0
AXX|Angel Fire Airport|Angel Fire|US|S0
AYA|Ayapel Airport|Ayapel|CO|S0
AYC|Ayacucho Airport|Ayacucho|CO|S0
AYD|Alroy Downs Airport|Alroy Downs|AU|S0
AYG|Yaguara Airport|San Vicente Del Caguán|CO|S0
AYI|Yari Airport|Yari|CO|S0
AYJ|Maharshi Valmiki International Airport|Faizabad|IN|M1
AYK|Arkalyk North Airport|Arkalyk|KZ|S0
AYL|Anthony Lagoon Airport||AU|S0
AYN|Anyang Yindu Airport|Anyang|CN|S0
AYO|Juan de Ayolas National Airport|Ayolas|PY|M0
AYP|Air Force Colonel Alfredo Mendivil Duarte Airport|Ayacucho|PE|M1
AYQ|Ayers Rock Connellan Airport|Yulara|AU|M1
AYR|Ayr Airport|Ayr|AU|S0
AYS|Waycross Ware County Airport|Waycross|US|S0
AYT|Antalya International Airport|Antalya|TR|L1
AYU|Aiyura Airport|Aiyura Valley|PG|S0
AYW|Ayawasi Airport|Ayawasi|ID|S0
AYX|Teniente General Gerardo Pérez Pinedo Airport|Atalaya|PE|M0
AZA|Mesa Gateway Airport|Mesa|US|M1
AZB|Amazon Bay Airport||PG|S0
AZD|Shahid Sadooghi Airport|Yazd|IR|M1
AZG|Apatzingán - Pablo L. Sidar Airport|Apatzingán|MX|S0
AZH|Azamgarh Airport|Azamgarh|IN|S0
AZI|Al Bateen Executive Airport|Abu Dhabi|AE|L0
AZJ|Zhenjiang Dalu Airport|Zhenjiang|CN|S0
AZL|Fazenda Tucunaré Airport|Sapezal|BR|S0
AZN|Andijan International Airport|Andijan|UZ|M1
AZO|Kalamazoo/Battle Creek International Airport|Kalamazoo|US|M1
AZP|Jorge Jiménez Cantú National Airport|Atizapán de Zaragoza|MX|S0
AZR|Touat-Cheikh Sidi Mohamed Belkebir Airport|Adrar|DZ|M1
AZS|Samaná El Catey International Airport|Samana|DO|M1
AZT|Zapatoca Airport|Zapatoca|CO|S0
AZZ|Ambriz Airport|Ambriz|AO|S0
BAA|Bialla Airport|Bialla, Matalilu, Ewase|PG|S0
BAB|Beale Air Force Base|Beale Air Force Base|US|M0
BAC|Barranca De Upia Airport|Barranca De Upia|CO|S0
BAD|Barksdale Air Force Base|Bossier City|US|M0
BAE|Barcelonnette - Saint-Pons Airfield|Saint-Pons, Alpes-de-Haute-Provence|FR|S0
BAF|Westfield-Barnes Regional Airport|Westfield|US|M0
BAG|Loakan Airport|Baguio|PH|M0
BAH|Bahrain International Airport|Manama|BH|L1
BAI|Buenos Aires Airport|Punta Arenas|CR|M0
BAJ|Bali Airport|Unea Island|PG|S0
BAL|Batman Airport|Batman|TR|M1
BAM|Battle Mountain Airport|Battle Mountain|US|S0
BAN|Basongo Airport|Basongo|CD|S0
BAQ|Ernesto Cortissoz International Airport|Barranquilla|CO|L1
BAR|Qionghai Bo'ao Airport|Qionghai (Basuo)|CN|M1
BAS|Ballalae Airport|Ballalae|SB|S1
BAT|Chafei Amsei Airport|Barretos|BR|M0
BAV|Baotou Donghe International Airport|Baotou|CN|L1
BAX|Barnaul Gherman Titov International Airport|Barnaul|RU|L1
BAY|Maramureș International Airport|Tăuții-Măgherăuș|RO|M1
BAZ|Barcelos Airport|Barcelos|BR|S1
BBA|Balmaceda Airport|Balmaceda|CL|M1
BBB|Benson Municipal Airport|Benson|US|S0
BBC|Bay City Regional Airport|Bay City|US|S0
BBD|Curtis Field|Brady|US|M0
BBG|Butaritari Airport|Butaritari|KI|S1
BBH|Stralsund-Barth Airport|Barth|DE|S0
BBI|Biju Patnaik International Airport|Bhubaneswar|IN|L1
BBJ|Bitburg Airport|Bitburg|DE|S0
BBK|Kasane International Airport|Kasane|BW|L1
BBL|Ballera Airport||AU|S0
BBM|Battambang Airport|Battambang|KH|M1
BBN|Bario Airport|Bario|MY|M1
BBO|Berbera Airport|Berbera|SO|M1
BBP|Bembridge Airport|Bembridge, Isle of Wight|GB|S0
BBQ|Burton-Nibbs International Airport|Codrington|AG|M1
BBR|Basse-Terre Baillif Airport|Basse-Terre|GP|S1
BBS|Blackbushe Airport|Camberley, Surrey|GB|M0
BBT|Berbérati Airport|Berbérati|CF|M0
BBU|Bucharest Băneasa Aurel Vlaicu International Airport|Bucharest|RO|L1
BBV|Nero-Mer Airport|Grand-Béréby|CI|S0
BBW|Broken Bow Municipal Airport|Broken Bow|US|S0
BBX|Wings Field|Philadelphia|US|S0
BBY|Bambari Airport|Bambari|CF|S0
BBZ|Zambezi Airport|Zambezi|ZM|S0
BCA|Gustavo Rizo Airport|Baracoa|CU|M1
BCB|Virginia Tech Montgomery Executive Airport|Blacksburg|US|S0
BCC|Bear Creek 3 Airport|Bear Creek|US|S0
BCD|Bacolod-Silay International Airport|Bacolod City|PH|L1
BCE|Bryce Canyon Airport|Bryce Canyon|US|M0
BCF|Bouca Airport|Bouca|CF|S0
BCG|Bemichi Airport|Kumaka|GY|S0
BCH|Baucau Airport|Baucau|TL|M1
BCI|Barcaldine Airport|Barcaldine|AU|M1
BCJ|Beichuan Yongchang Airport|Mianyang|CN|S0
BCK|Bolwarra Airport||AU|S0
BCL|Barra del Colorado Airport|Pococi|CR|M0
BCM|Bacău George Enescu International  Airport|Bacău|RO|L1
BCN|Josep Tarradellas Barcelona-El Prat Airport|Barcelona|ES|L1
BCO|Jinka Airport|Jinka|ET|M1
BCP|Bambu Airport|Bambu|PG|S0
BCQ|Brak Airport|Brak|LY|M0
BCR|Novo Campo Airport|Boca do Acre|BR|S0
BCS|Southern Seaplane Airport|Belle Chasse|US|S0
BCT|Boca Raton Airport|Boca Raton|US|M0
BCU|Sir Abubakar Tafawa Balewa Bauchi State International Airport|Bauchi|NG|L1
BCV|Hector Silva Airstrip|Belmopan|BZ|S0
BCW|Benguera Island Airport|Benguera Island|MZ|M0
BCX|Beloretsk Airport|Beloretsk|RU|S0
BCZ|Milyakburra Airport|Bickerton Island|AU|S0
BDA|L.F. Wade International Airport|Hamilton|BM|L1
BDB|Bundaberg Airport|Bundaberg|AU|M1
BDC|Barra do Corda Airport|Barra do Corda|BR|S0
BDD|Badu Island Airport|Badu Island|AU|S1
BDE|Baudette International Airport|Baudette|US|M0
BDF|Rinkenberger Restricted Landing Area|Bradford|US|S0
BDG|Blanding Municipal Airport|Blanding|US|S0
BDH|Bandar Lengeh International Airport|Bandar Lengeh|IR|M1
BDI|Bird Island Airport|Bird Island|SC|S0
BDJ|Syamsudin Noor International Airport|Banjarbaru|ID|L1
BDK|Soko Airport|Bondoukou|CI|S0
BDL|Bradley International Airport|Hartford|US|L1
BDM|Bandırma Airport|Bandırma|TR|M0
BDN|Talhar Airport|Badin|PK|S0
BDO|Husein Sastranegara International Airport|Bandung|ID|M1
BDP|Bhadrapur Airport|Bhadrapur|NP|S1
BDQ|Vadodara International Airport|Vadodara|IN|L1
BDR|Igor I Sikorsky Memorial Airport|Bridgeport|US|M0
BDS|Brindisi Airport|Brindisi|IT|L1
BDT|Gbadolite Airport|Gbadolite|CD|M1
BDU|Bardufoss Airport|Målselv|NO|M1
BDV|Moba Airport|Moba|CD|S0
BDW|Bedford Downs Airport||AU|S0
BDX|Broadus Airport|Broadus|US|S0
BDY|Bandon State Airport|Bandon|US|S0
BDZ|Baindoung Airport||PG|S0
BEB|Benbecula Airport|Balivanich|GB|M1
BEC|Beech Factory Airport|Wichita|US|S0
BED|Laurence G Hanscom Field|Bedford|US|M1
BEE|Beagle Bay Airport|Dampier Peninsula|AU|S0
BEF|Bluefields Airport|Bluefields|NI|M1
BEG|Belgrade Nikola Tesla Airport|Belgrade|RS|L1
BEH|Southwest Michigan Regional Airport|Benton Harbor|US|S0
BEI|Beica Airport|Beica|ET|S0
BEJ|Kalimarau Airport|Tanjung Redeb - Borneo Island|ID|M1
BEK|Bareilly Air Force Station|Bareilly|IN|M1
BEL|Val de Cans/Júlio Cezar Ribeiro International Airport|Belém|BR|L1
BEM|Beni Mellal Airport|Oulad Yaich|MA|L1
BEN|Benina International Airport|Benina|LY|L1
BEO|Lake Macquarie Airport|City of Lake Macquarie|AU|S0
BEP|Bellary Airport|Bellary|IN|M0
BEQ|RAF Honington|Bury Saint Edmunds, Suffolk|GB|M0
BER|Berlin Brandenburg Airport|Berlin|DE|L1
BES|Brest Bretagne airport|Brest|FR|L1
BET|Bethel Airport|Bethel|US|M1
BEU|Bedourie Airport|Bedourie|AU|M1
BEV|Beersheba (Teyman) Airport|Beersheba|IL|S0
BEW|Beira International Airport|Beira|MZ|L1
BEX|RAF Benson|Wallingford, Oxfordshire|GB|M0
BEY|Beirut Rafic Hariri International Airport|Beirut|LB|L1
BEZ|Beru Airport|Beru|KI|S0
BFA|Bahía Negra Airport|Bahía Negra|PY|S0
BFC|Bloomfield River Airport||AU|S0
BFD|Bradford Regional Airport|Bradford|US|M1
BFE|Bielefeld Airport|Bielefeld|DE|M0
BFF|Western Neb. Rgnl/William B. Heilig Airport|Scottsbluff|US|M1
BFG|Bullfrog Basin Airport|Bullfrog|US|S0
BFH|Bacacheri Airport|Curitiba|BR|M0
BFI|King County International Airport - Boeing Field|Seattle|US|M1
BFJ|Bijie Feixiong Airport|Bijie|CN|M1
BFK|Buckley Space Force Base|Aurora|US|M0
BFL|Meadows Field|Bakersfield|US|M1
BFM|Mobile Downtown Airport|Mobile|US|M0
BFN|Bram Fischer International Airport|Bloemfontein|ZA|L1
BFO|Buffalo Range Airport|Chiredzi|ZW|M0
BFP|Beaver County Airport|Beaver Falls|US|M0
BFQ|Bahia Piña Airport|Puerto Piña|PA|S1
BFR|Virgil I Grissom Municipal Airport|Bedford|US|S0
BFS|Belfast International Airport|Belfast|GB|L1
BFT|Beaufort Executive Airport|Beaufort|US|S0
BFU|Bengbu Renheji Airport|Bengbu|CN|M0
BFV|Buri Ram Airport|Buriram|TH|M1
BFW|Sidi Bel Abbes Airport|Sidi Bel Abbès|DZ|S0
BFX|Bafoussam Airport|Bafoussam|CM|M0
BFY|Bengbu Tenghu Airport|Bengbu|CN|M1
BGA|Palonegro Airport|Bucaramanga|CO|M1
BGB|Booue Airport|Booue|GA|S0
BGC|Bragança Airport|Bragança|PT|M1
BGD|Hutchinson County Airport|Borger|US|S0
BGE|Decatur County Industrial Air Park|Bainbridge|US|S0
BGF|Bangui M'Poko International Airport|Bangui|CF|L1
BGG|Bingöl Airport|Bingöl|TR|M1
BGH|Abbaye Airport|Boghe|MR|S0
BGI|Grantley Adams International Airport|Bridgetown|BB|L1
BGJ|Borgarfjörður eystri Airport|Borgarfjörður eystri|IS|S0
BGK|Big Creek Airport|Big Creek|BZ|S1
BGL|Baglung Airport|Baglung|NP|S0
BGM|Greater Binghamton/Edwin A Link field|Binghamton|US|M1
BGN|Belaya Gora Airport|Belaya Gora|RU|M0
BGO|Bergen Airport, Flesland|Bergen|NO|L1
BGQ|Big Lake Airport|Big Lake|US|S0
BGR|Bangor International Airport|Bangor|US|M1
BGS|Boguchany Airport|Boguchany|RU|S0
BGT|Bagdad Airport|Bagdad|US|S0
BGU|Bangassou Airport|Bangassou|CF|S0
BGV|Aeroclube de Bento Gonçalves Airport|Bento Gonçalves|BR|S0
BGW|Baghdad International Airport / New Al Muthana Air Base|Baghdad|IQ|L1
BGX|Comandante Gustavo Kraemer Airport|Bagé|BR|M0
BGY|Il Caravaggio International Airport|Orio al Serio (BG)|IT|L1
BHA|Los Perales Airport|Bahía de Caraquez|EC|S0
BHB|Hancock County-Bar Harbor Airport|Bar Harbor|US|M1
BHC|Bhurban Heliport|Bhurban|PK|S0
BHD|George Best Belfast City Airport|Belfast|GB|M1
BHE|Woodbourne Airport|Blenheim|NZ|M1
BHF|Cupica Airport|Bahía Solano|CO|S0
BHG|Brus Laguna Airport|Brus Laguna|HN|S0
BHH|Bisha Airport|Bisha|SA|M1
BHI|Comandante Espora Airport|Bahía Blanca|AR|M1
BHJ|Bhuj Airport|Bhuj|IN|M1
BHK|Bukhara International Airport|Bukhara|UZ|L1
BHL|Bahía de los Ángeles Airport|Ensenada|MX|S0
BHM|Birmingham-Shuttlesworth International Airport|Birmingham|US|L1
BHN|Beihan Airport|Beihan|YE|S0
BHO|Raja Bhoj International Airport|Bhopal|IN|L1
BHP|Bhojpur Airport|Bhojpur|NP|S0
BHQ|Broken Hill Airport|Broken Hill|AU|M1
BHR|Bharatpur Airport|Bharatpur|NP|S1
BHS|Bathurst Airport|Bathurst|AU|M1
BHT|Brighton Downs Airport|Brighton Downs|AU|S0
BHU|Bhavnagar Airport|Bhavnagar|IN|M1
BHV|Bahawalpur Airport|Bahawalpur|PK|M1
BHW|Bhagatanwala Airport|Bhagatanwala|PK|S0
BHX|Birmingham Airport|Birmingham, West Midlands|GB|L1
BHY|Beihai Fucheng Airport|Beihai|CN|M1
BIA|Bastia-Poretta International airport|Bastia|FR|L1
BIB|Baidoa Airport|Baidoa|SO|S0
BIC|Aérodrome de Belle Île|Bangor|FR|S0
BID|Block Island State Airport|Block Island|US|S1
BIE|Beatrice Municipal Airport|Beatrice|US|S0
BIF|Biggs Army Air Field (Fort Bliss)|Fort Bliss/El Paso|US|M0
BIG|Allen Army Airfield|Delta Junction Ft Greely|US|M0
BIH|Eastern Sierra Regional Airport|Bishop|US|M1
BII|Bikini Atoll Airport|Bikini Atoll|MH|S0
BIJ|Biliau Airport||PG|S0
BIK|Frans Kaisiepo Airport|Biak|ID|M1
BIL|Billings Logan International Airport|Billings|US|M1
BIM|South Bimini Airport|South Bimini|BS|M1
BIN|Bamyan Airport|Bamyan|AF|S0
BIO|Bilbao Airport|Bilbao|ES|L1
BIP|Bulimba Airport||AU|S0
BIQ|Biarritz Pays Basque airport|Biarritz|FR|M1
BIR|Biratnagar Airport|Biratnagar|NP|M1
BIS|Bismarck Municipal Airport|Bismarck|US|M1
BIT|Baitadi Airport|Baitadi|NP|S0
BIU|Bildudalur Airport|Bildudalur|IS|M0
BIV|Bria Airport|Bria|CF|S0
BIW|Billiluna Airport||AU|S0
BIX|Keesler Air Force Base|Biloxi|US|M0
BIY|Bisho Airport|Bisho|ZA|M0
BIZ|Bimin Airport|Bimin|PG|S0
BJA|Soummam–Abane Ramdane Airport|Béjaïa|DZ|L1
BJB|Bojnord Airport|Bojnord|IR|M1
BJC|Rocky Mountain Metropolitan Airport|Denver|US|M1
BJE|Baleela Airport|Baleela Base Camp|SD|S0
BJF|Båtsfjord Airport|Båtsfjord|NO|M1
BJH|Bajhang Airport|Bajhang|NP|S0
BJI|Bemidji Regional Airport|Bemidji|US|M0
BJJ|Wayne County Airport|Wooster|US|S0
BJK|Benjina Airport|Maikoor Island|ID|S0
BJL|Banjul International Airport|Banjul (Yundum)|GM|L1
BJM|Bujumbura Melchior Ndadaye International Airport|Bujumbura|BI|L1
BJO|Bermejo Airport|Bermejo|BO|M0
BJP|Estadual Arthur Siqueira Airport|Bragança Paulista|BR|S0
BJQ|Bahja Airport|Bahja|OM|S0
BJR|Bahir Dar Airport|Bahir Dar|ET|M1
BJU|Bajura Airport|Bajura|NP|S0
BJV|Milas Bodrum International Airport|Bodrum|TR|L1
BJW|Bajawa Soa (Turelelo) Airport|Soa, Ngada|ID|S0
BJX|Guanajuato International Airport|Silao|MX|L1
BJY|Batajnica Air Base|Zemun|RS|M0
BJZ|Badajoz Airport|Badajoz|ES|M1
BKA|Baykit Airport|Baykit|RU|M0
BKB|Nal Airport|Bikaner|IN|M0
BKC|Buckland Airport|Buckland|US|S1
BKD|Stephens County Airport|Breckenridge|US|S0
BKE|Baker City Municipal Airport|Baker City|US|M0
BKG|Branson Airport|Branson|US|M1
BKH|Barking Sands Airport|Kekaha|US|M0
BKI|Kota Kinabalu International Airport|Kota Kinabalu|MY|L1
BKJ|Boké Baralande Airport|Boké|GN|S0
BKK|Suvarnabhumi Airport|Bangkok|TH|L1
BKL|Burke Lakefront Airport|Cleveland|US|M0
BKM|Bakalalan Airport|Bakalalan|MY|S1
BKN|Balkanabat International Airport|Balkanabat|TM|M1
BKO|Modibo Keita International Airport|Bamako|ML|L1
BKP|Barkly Downs Airport||AU|S0
BKQ|Blackall Airport|Blackall|AU|M1
BKR|Bokoro Airport|Bokoro|TD|S0
BKS|Fatmawati Soekarno Airport|Bengkulu|ID|M1
BKT|Allen C Perkinson Blackstone Army Air Field|Blackstone|US|S0
BKU|Betioky Airport|Betioky|MG|S0
BKV|Bailing Airport|Bailingmiao|CN|S0
BKW|Raleigh County Memorial Airport|Beaver|US|M1
BKX|Brookings Regional Airport|Brookings|US|S0
BKY|Bukavu Kavumu Airport|Kamakombe|CD|M0
BKZ|Bukoba Airport|Bukoba|TZ|S1
BLA|General José Antonio Anzoategui International Airport|Barcelona|VE|L1
BLB|Panamá Pacífico International Airport|Panamá City|PA|S1
BLC|Bali Airport|Bali|CM|S0
BLD|Boulder City Municipal Airport|Boulder City|US|M1
BLE|Dala Airport|Borlange|SE|M1
BLF|Mercer County Airport|Bluefield|US|M0
BLG|Belaga Airport|Belaga|MY|S0
BLH|Blythe Airport|Blythe|US|M0
BLI|Bellingham International Airport|Bellingham|US|M1
BLJ|Batna Mostefa Ben Boulaid Airport|Batna|DZ|L1
BLK|Blackpool Airport|Blackpool|GB|M0
BLL|Billund Airport|Billund|DK|L1
BLM|Monmouth Executive Airport|Belmar/Farmingdale|US|S0
BLN|Benalla Airport|Benalla|AU|M0
BLO|Blönduós Airport|Blönduós|IS|S0
BLP|Huallaga Airport|Bellavista|PE|S0
BLQ|Bologna Guglielmo Marconi Airport|Bologna|IT|L1
BLR|Kempegowda International Airport Bengaluru|Bengaluru|IN|L1
BLS|Bollon Airport||AU|S0
BLT|Blackwater Airport||AU|M0
BLU|Blue Canyon Nyack Airport|Emigrant Gap|US|S0
BLV|Scott AFB/Midamerica Airport|Belleville|US|M1
BLW|Beledweyne Airport|Beledweyne|SO|S1
BLX|Belluno Arturo dell'Oro Airport|Belluno (BL)|IT|S0
BLY|Belmullet Aerodrome|Belmullet|IE|S0
BLZ|Chileka International Airport|Blantyre|MW|L1
BMA|Stockholm-Bromma Airport|Stockholm|SE|M1
BMB|Bumba Airport|Bumba|CD|S0
BMC|Brigham City Regional Airport|Brigham City|US|S0
BMD|Belo sur Tsiribihina Airport|Belo sur Tsiribihina|MG|S0
BME|Broome International Airport|Broome|AU|L1
BMF|Bakouma Airport|Bakouma|CF|S0
BMG|Monroe County Airport|Bloomington|US|M0
BMH|Bomai Airport|Bomai|PG|S0
BMI|Central Illinois Regional Airport at Bloomington-Normal|Bloomington/Normal|US|M1
BMJ|Baramita Airport|Baramita|GY|S0
BMK|Borkum Airport|Borkum|DE|S1
BML|Berlin Regional Airport|Berlin|US|S0
BMM|Bitam Airport|Bitam|GA|M0
BMN|Bamarni Airport|Bamarni|IQ|S0
BMO|Banmaw Airport|Banmaw|MM|S1
BMP|Brampton Island Airport||AU|S0
BMQ|Bamburi Airport|Bamburi|KE|S0
BMR|Baltrum Airport|Baltrum|DE|S1
BMS|Sócrates Mariani Bittencourt Airport|Brumado|BR|S0
BMT|Beaumont Municipal Airport|Beaumont|US|S0
BMU|Sultan Muhammad Salahuddin Airport|Bima|ID|M1
BMV|Buon Ma Thuot Airport|Buon Ma Thuot|VN|M1
BMW|Bordj Badji Mokhtar Airport|Bordj Badji Mokhtar|DZ|M1
BMX|Big Mountain Airport|Big Mountain|US|S0
BMY|Île Art - Waala Airport|Waala|NC|S1
BMZ|Bamu Airport|Bamu|PG|S0
BNA|Nashville International Airport|Nashville|US|L1
BNB|Boende Airport|Boende|CD|S1
BNC|Beni Airport|Beni|CD|S0
BND|Bandar Abbas International Airport|Bandar Abbas|IR|L1
BNE|Brisbane International Airport|Brisbane|AU|L1
BNG|Banning Municipal Airport|Banning|US|S0
BNI|Benin Airport|Benin|NG|M1
BNK|Ballina Byron Gateway Airport|Ballina|AU|M1
BNL|Barnwell Regional Airport|Barnwell|US|S0
BNM|Bodinumu Airport|Bodinumu|PG|S0
BNN|Brønnøysund Airport, Brønnøy|Brønnøy|NO|M1
BNO|Burns Municipal Airport|Burns|US|M0
BNR|Banfora Airport|Banfora|BF|S0
BNS|Barinas Airport|Barinas|VE|M1
BNT|Bundi Airport|Bundi|PG|S0
BNU|Blumenau Airport|Blumenau|BR|S0
BNV|Boana Airport|Boana|PG|S0
BNW|Boone Municipal Airport|Boone|US|S0
BNX|Banja Luka International Airport|Mahovljani|BA|L1
BNY|Bellona/Anua Airport|Anua|SB|S1
BOA|Boma Airport|Boma|CD|S0
BOB|Bora Bora Airport|Motu Mute|PF|M1
BOC|Bocas del Toro "Isla Colón" International Airport|Isla Colón|PA|M1
BOD|Bordeaux–Mérignac Airport|Bordeaux|FR|L1
BOE|Boundji Airport|Boundji|CG|S0
BOG|El Dorado International Airport|Bogota|CO|L1
BOH|Bournemouth Airport|Bournemouth|GB|M1
BOI|Boise Air Terminal/Gowen Field|Boise|US|L1
BOJ|Burgas Airport|Burgas|BG|L1
BOK|Brookings Airport|Brookings|US|S0
BOM|Chhatrapati Shivaji Maharaj International Airport|Mumbai|IN|L1
BON|Flamingo International Airport|Kralendijk|BQ|L1
BOO|Bodø Airport|Bodø|NO|L1
BOP|Bouar Airport|Bouar|CF|S0
BOR|Bokeo International Airport|Ton Phueng|LA|M1
BOS|Boston Logan International Airport|Boston|US|L1
BOT|Bosset Airport|Bosset|PG|S1
BOU|Bourges airport|Bourges|FR|M0
BOV|Boang Airport|Boang Island|PG|S0
BOW|Bartow Executive Airport|Bartow|US|S0
BOX|Borroloola Airport||AU|S0
BOY|Bobo Dioulasso Airport|Bobo Dioulasso|BF|L1
BOZ|Bozoum Airport|Bozoum|CF|S0
BPA|Borongan Airport|Borongan City|PH|S0
BPC|Bamenda Airport|Bamenda|CM|M0
BPD|Bapi Airstrip|Bapi|PG|S0
BPE|Qinhuangdao Beidaihe Airport|Qinhuangdao (Changli)|CN|M1
BPF|Batuna Aerodrome|Batuna Mission Station|SB|S0
BPG|Barra do Garças Airport|Barra do Garças|BR|M0
BPH|Bislig Airport|Bislig|PH|M0
BPI|Miley Memorial Field|Big Piney|US|M0
BPK|Biangabip Airport|Biangabip|PG|S0
BPL|Bole Alashankou Airport|Bole|CN|M1
BPM|Begumpet Airport|Hyderabad|IN|M0
BPN|Sultan Aji Muhammad Sulaiman Sepinggan International Airport|Balikpapan|ID|L1
BPS|Porto Seguro International Airport|Porto Seguro|BR|L1
BPT|Jack Brooks Regional Airport|Beaumont/Port Arthur|US|M1
BPX|Qamdo Bangda Airport|Bangda|CN|M1
BPY|Besalampy Airport|Besalampy|MG|M1
BQA|Dr. Juan C. Angara Airport|Baler|PH|M0
BQB|Busselton Margaret River Regional Airport|Busselton|AU|S1
BQE|Bubaque Airport|Bubaque|GW|S0
BQG|Bogorodskoye Airport|Bogorodskoye|RU|S1
BQH|London Biggin Hill Airport|London|GB|M0
BQI|Bagani Airport|Bagani|NA|S0
BQJ|Batagay Airport|Batagay|RU|S1
BQK|Brunswick Golden Isles Airport|Brunswick|US|M1
BQL|Boulia Airport||AU|M1
BQN|Rafael Hernández International Airport|Aguadilla|PR|M1
BQO|Bouna Airport|Bouna|CI|S0
BQQ|Barra Airport|Barra|BR|S0
BQR|Maulana Prins Mandapar Airstrip|Kendek|ID|S0
BQS|Ignatyevo Airport|Blagoveschensk|RU|M1
BQT|Brest International Airport|Brest|BY|L1
BQU|J F Mitchell Airport|Bequia|VC|M1
BQW|Balgo Hill Airport|Balgo|AU|S0
BRA|Dom Ricardo Weberberger Airport|Barreiras|BR|S1
BRB|Barreirinhas National Airport|Barreirinhas|BR|S0
BRC|Teniente Luis Candelaria International Airport|San Carlos de Bariloche|AR|L1
BRD|Brainerd Lakes Regional Airport|Brainerd|US|M1
BRE|Bremen Airport|Bremen|DE|L1
BRG|Siau/Sitaro Airport|Balirangen|ID|S0
BRH|Brahman Airstrip|Brahman Mission|PG|S0
BRI|Bari Karol Wojtyła International Airport|Bari|IT|L1
BRK|Bourke Airport||AU|M1
BRL|Southeast Iowa Regional Airport|Burlington|US|M1
BRM|Jacinto Lara International Airport|Barquisimeto|VE|L1
BRN|Bern Airport|Bern|CH|M1
BRO|Brownsville South Padre Island International Airport|Brownsville|US|M1
BRP|Biaru Airport|Biaru|PG|S0
BRQ|Brno-Tuřany Airport|Brno|CZ|M1
BRR|Barra Airport|Eoligarry|GB|M1
BRS|Bristol Airport|Bristol|GB|L1
BRT|Bathurst Island Airport|Wurrumiyanga|AU|M0
BRU|Brussels Airport|Zaventem|BE|L1
BRW|Wiley Post Will Rogers Memorial Airport|Utqiaġvik|US|M1
BRX|Maria Montez International Airport|Barahona|DO|M1
BRY|Samuels Field|Bardstown|US|S0
BSA|Bender Qassim International Airport|Bosaso|SO|L1
BSB|Presidente Juscelino Kubitschek International Airport|Brasília|BR|L1
BSC|José Celestino Mutis Airport|Bahía Solano|CO|M1
BSD|Baoshan Yunrui Airport|Baoshan (Longyang)|CN|M1
BSE|Sematan Airport|Sematan|MY|S0
BSF|Bradshaw Army Airfield|Waimea (Kamuela)|US|S0
BSG|Bata International Airport|Bata|GQ|L1
BSI|Balesin Island Airport|Balesin|PH|S1
BSJ|Bairnsdale Airport|Bairnsdale|AU|M0
BSK|Biskra - Mohamed Khider Airport|Biskra|DZ|L1
BSL|EuroAirport Basel–Mulhouse–Freiburg|Bâle / Mulhouse|FR|L1
BSM|Bishe Kola Air Base|Amol|IR|S0
BSN|Bossangoa Airport|Bossangoa|CF|S0
BSO|Basco Airport|Basco|PH|M1
BSP|Bensbach Airport|Bensbach|PG|S0
BSQ|Bisbee Municipal Airport|Bisbee|US|S0
BSR|Basra International Airport|Basra|IQ|L1
BSS|Balsas Airport|Balsas|BR|S0
BST|Bost Airport|Lashkar Gah|AF|S0
BSU|Basankusu Airport|Basankusu|CD|S0
BSV|Besakoa Airport|Besakoa|MG|S0
BSW|Boswell Bay Airport|Boswell Bay|US|S0
BSX|Pathein Airport|Pathein|MM|S1
BSY|Baardheere Airport|Baardheere|SO|S0
BSZ|Manas International Airport|Bishkek|KG|L1
BTA|Bertoua Airport|Bertoua|CM|S0
BTB|Betou Airport|Betou|CG|S0
BTC|Batticaloa International Airport|Batticaloa|LK|M1
BTD|Brunette Downs Airport||AU|S0
BTF|Skypark Airport|Bountiful|US|S0
BTG|Batangafo Airport|Batangafo|CF|S0
BTH|Hang Nadim International Airport|Batam|ID|L1
BTI|Barter Island Long Range Radar Station Airport|Barter Island|US|M1
BTJ|Sultan Iskandar Muda International Airport|Banda Aceh|ID|L1
BTK|Bratsk Airport|Bratsk|RU|M1
BTL|Battle Creek Executive Airport at Kellogg Field|Battle Creek|US|M0
BTM|Bert Mooney Airport|Butte|US|M1
BTN|Marlboro County Jetport - H E Avent Field Airport|Bennettsville|US|S0
BTO|Botopasi Airport|Botopasi|SR|S0
BTP|Pittsburgh/Butler Regional Airport|Butler|US|S0
BTQ|Butare Airport|Butare|RW|S0
BTR|Baton Rouge Metropolitan Airport|Baton Rouge|US|M1
BTS|M. R. Štefánik Airport|Bratislava|SK|L1
BTT|Bettles Airport|Bettles|US|S1
BTU|Bintulu Airport|Bintulu|MY|M1
BTV|Patrick Leahy Burlington International Airport|Burlington|US|M1
BTW|Bersujud Airport|Batu Licin|ID|S1
BTX|Betoota Airport||AU|S0
BTY|Beatty Airport|Beatty|US|S0
BTZ|Betong International Airport|Betong|TH|M0
BUA|Buka Airport|Buka Island|PG|M1
BUB|Cram Field|Burwell|US|S0
BUC|Burketown Airport||AU|S1
BUD|Budapest Liszt Ferenc International Airport|Budapest|HU|L1
BUF|Buffalo Niagara International Airport|Buffalo|US|L1
BUG|Benguela Airport|Benguela|AO|M0
BUI|Bokondini Airport|Bokondini|ID|S1
BUJ|Bou Saada Airport|Ouled Sidi Brahim|DZ|M0
BUK|Al-Bough Airport|Al-Bough|YE|S0
BUL|Bulolo Airport|Bulolo|PG|S0
BUM|Butler Memorial Airport|Butler|US|S0
BUN|Gerardo Tobar López Airport|Buenaventura|CO|M1
BUO|Burao Airport|Burao|SO|S0
BUP|Bhatinda Air Force Station||IN|M0
BUQ|Joshua Mqabuko Nkomo International Airport|Bulawayo|ZW|L1
BUR|Hollywood Burbank/Bob Hope Airport|Burbank|US|L1
BUS|Alexander Kartveli Batumi International Airport|Batumi|GE|L1
BUT|Bathpalathang Airport|Jakar|BT|S1
BUU|Muara Bungo Airport|Muara Bungo|ID|S1
BUV|Placeres Airport|Bella Union|UY|S0
BUW|Betoambari Airport|Bau Bau|ID|S0
BUX|Bunia Airport|Bunia|CD|M1
BUY|Bunbury Airport||AU|S0
BUZ|Bushehr Airport|Bushehr|IR|M1
BVA|Beauvais-Tillé airport|Beauvais|FR|L1
BVB|Atlas Brasil Cantanhede International Airport|Boa Vista|BR|L1
BVC|Aristides Pereira International Airport|Rabil|CV|L1
BVE|Brive Souillac airport|Brive|FR|M1
BVG|Berlevåg Airport|Berlevåg|NO|M1
BVH|Brigadeiro Camarão Airport|Vilhena|BR|M1
BVI|Birdsville Airport||AU|M1
BVJ|Bovanenkovo Airport|Bovanenkovo|RU|M1
BVK|Huacaraje Airport|Itenes|BO|S0
BVL|Baures Airport|Baures|BO|S0
BVM|Belmonte Airport|Belmonte|BR|S0
BVO|Bartlesville Municipal Airport|Bartlesville|US|S0
BVS|Breves Airport|Breves|BR|S1
BVU|Beluga Airport|Beluga|US|S0
BVV|Burevestnik Airport|Kurilsk|RU|S0
BVW|Batavia Downs Airport||AU|S0
BVX|Batesville Regional Airport|Batesville|US|S0
BVY|Beverly Regional Airport|Beverly / Danvers|US|M0
BVZ|Beverley Springs Airport|Wunaamin Miliwundi Ranges|AU|S0
BWA|Gautam Buddha International Airport|Siddharthanagar (Bhairahawa)|NP|L1
BWB|Barrow Island Airport||AU|S0
BWC|Brawley Municipal Airport|Brawley|US|S0
BWD|Brownwood Regional Airport|Brownwood|US|S0
BWE|Braunschweig-Wolfsburg Airport|Braunschweig|DE|M0
BWF|Barrow Walney Island Airport|Barrow-in-Furness|GB|M0
BWG|Bowling Green Warren County Regional Airport|Bowling Green|US|M0
BWH|RMAF Butterworth Air Base|Butterworth|MY|M0
BWI|Baltimore/Washington International Thurgood Marshall Airport|Baltimore|US|L1
BWJ|Bawan Airport||PG|S0
BWK|Brač Airport|Gornji Humac|HR|M1
BWL|Blackwell Tonkawa Municipal Airport|Blackwell|US|S0
BWM|Bowman Regional Airport|Bowman|US|S0
BWN|Brunei International Airport|Bandar Seri Begawan|BN|L1
BWO|Balakovo Airport|Balakovo|RU|M1
BWP|Bewani Airport|Bewani|PG|S0
BWQ|Brewarrina Airport||AU|M0
BWT|Wynyard Airport|Burnie|AU|M1
BWU|Sydney Bankstown Airport|Sydney|AU|M0
BWW|Las Brujas Airport|Cayo Santa Maria|CU|S0
BWX|Banyuwangi Airport|Rogojampi, Banyuwangi|ID|S1
BXA|George R Carr Memorial Air Field|Bogalusa|US|S0
BXB|Babo Airport|Babo|ID|M0
BXD|Bade Airport|Bade|ID|S0
BXE|Bakel Airport|Bakel|SN|M0
BXF|Bellburn Airstrip|Pumululu National Park|AU|S0
BXG|Bendigo Airport||AU|S1
BXH|Balkhash Airport|Balkhash|KZ|M1
BXI|Boundiali Airport|Boundiali|CI|S0
BXJ|Boralday Airport|Boralday|KZ|S0
BXK|Buckeye Municipal Airport|Buckeye|US|S0
BXM|Batom Airport|Batom|ID|S0
BXN|Bodrum-Imsık Airport|Bodrum|TR|S0
BXO|Buochs Airport|Buochs|CH|S0
BXR|Bam Airport|Bam|IR|M1
BXS|Borrego Valley Airport|Borrego Springs|US|S0
BXT|LNG Badak Airport|Bontang-Borneo Island|ID|S1
BXU|Bancasi Airport|Butuan|PH|M1
BXV|Breiðdalsvík Airport|Breiðdalsvík|IS|S0
BXW|Harun Thohir Airport|Bawean|ID|S0
BXX|Borama Airport|Borama|SO|S0
BXY|Baikonur Krayniy International Airport|Baikonur|KZ|L1
BXZ|Bunsil Airport|Bunsil - Umboi Island|PG|S0
BYA|Boundary Airport|Boundary|US|S0
BYB|Dibba Airport|Dibba al Baya|OM|S0
BYC|Yacuiba Airport|Yacuíba|BO|M0
BYD|Al-Bayda Airport|Al-Bayda|YE|S0
BYF|Albert Bray airport|Albert|FR|S0
BYG|Johnson County Airport|Buffalo|US|S0
BYH|Arkansas International Airport|Blytheville|US|M0
BYI|Burley Municipal Airport|Burley|US|M0
BYJ|Beja Airport / Airbase|Beja|PT|M0
BYK|Bouaké Airport|Bouaké|CI|M1
BYL|Bella Yella Airport|Beliyela|LR|S0
BYM|Carlos Manuel de Cespedes Airport|Bayamo|CU|M1
BYN|Bayankhongor Airport|Bayankhongor|MN|M1
BYO|Bonito Airport|Bonito|BR|S1
BYP|Barimunya Airport||AU|S0
BYR|Læsø Airport|Læsø|DK|S1
BYS|Bicycle Lake Army Air Field|Fort Irwin/Barstow|US|M0
BYT|Bantry Aerodrome|Bantry|IE|S0
BYU|Bayreuth Airport|Bindlach|DE|M0
BYW|Blakely Island Airport|Blakely Island|US|S1
BYX|Baniyala Airport|Baniyala|AU|S0
BZA|San Pedro Airport|Bonanza|NI|S0
BZB|Bazaruto Island Airport|Bazaruto Island|MZ|M0
BZC|Umberto Modiano Airport|Cabo Frio|BR|M0
BZD|Balranald Airport||AU|M0
BZE|Philip S. W. Goldson International Airport|Belize City|BZ|L1
BZF|Benton Field|Redding|US|S0
BZG|Ignacy Jan Paderewski Bydgoszcz Airport|Bydgoszcz|PL|M1
BZH|Bumi Hills Airport|Bumi|ZW|S0
BZI|Balıkesir Airport|Balıkesir|TR|M1
BZJ|Bozhou Airport (under construction)|Bozhou|CN|S0
BZK|Bryansk International Airport|Bryansk|RU|M0
BZL|Barisal Airport|Barisal|BD|M1
BZM|Bemolanga Airport|Bemolanga|MG|S0
BZN|Bozeman Yellowstone International Airport|Bozeman|US|M1
BZO|Bolzano Airport|Bolzano (BZ)|IT|M1
BZP|Bizant Airport|Lakefield National Park|AU|S0
BZR|Béziers Vias airport|Béziers|FR|M1
BZT|Eagle Air Park|Brazoria|US|S0
BZU|Buta Zega Airport|Buta|CD|M0
BZV|Maya-Maya International Airport|Brazzaville|CG|L1
BZX|Bazhong Enyang Airport|Bazhong|CN|M1
BZY|Bălți-Leadoveni International Airport|Bălți|MD|M0
BZZ|RAF Brize Norton|Carterton, Oxfordshire|GB|M0
CAA|El Aguacate Airport|El Aguacate|HN|S0
CAB|Cabinda Airport|Cabinda|AO|M1
CAC|Coronel Adalberto Mendes da Silva Airport|Cascavel|BR|M1
CAD|Wexford County Airport|Cadillac|US|S0
CAE|Columbia Metropolitan Airport|Columbia|US|M1
CAF|Carauari Airport|Carauari|BR|S1
CAG|Cagliari Elmas Airport|Cagliari|IT|L1
CAH|Cà Mau Airport|Ca Mau City|VN|M1
CAI|Cairo International Airport|Cairo|EG|L1
CAJ|Canaima Airport|Canaima|VE|M1
CAK|Akron Canton Regional Airport|Akron|US|M1
CAL|Campbeltown Airport|Campbeltown|GB|M1
CAM|Camiri Airport|Camiri|BO|S0
CAN|Guangzhou Baiyun International Airport|Guangzhou (Huadu)|CN|L1
CAO|Clayton Municipal Airpark|Clayton|US|S0
CAP|Cap Haitien International Airport|Cap Haitien|HT|L1
CAQ|Juan H White Airport|Caucasia|CO|M0
CAR|Caribou Municipal Airport|Caribou|US|M0
CAT|Cascais Airport|Cascais|PT|M1
CAU|Caruaru Airport|Caruaru|BR|S1
CAV|Cazombo Airport|Cazombo|AO|S0
CAW|Bartolomeu Lisandro Airport|Campos dos Goytacazes|BR|M1
CAX|Carlisle Lake District Airport|Carlisle, Cumbria|GB|M0
CAY|Cayenne – Félix Eboué Airport|Matoury|GF|L1
CAZ|Cobar Airport||AU|M1
CBB|Jorge Wilsterman International Airport|Cochabamba|BO|L1
CBC|Cherrabun Airport||AU|S0
CBD|Car Nicobar Air Force Base|IAF Camp|IN|M0
CBE|Greater Cumberland Regional Airport|Wiley Ford|US|S0
CBF|Council Bluffs Municipal Airport|Council Bluffs|US|S0
CBG|Cambridge City Airport|Cambridge, Cambridgeshire|GB|M0
CBH|Béchar Boudghene Ben Ali Lotfi Airport|Béchar|DZ|M1
CBI|Cape Barren Island Airport|Cape Barren Island|AU|S0
CBJ|Cabo Rojo Airport|Cabo Rojo|DO|M0
CBK|Shalz Field|Colby|US|S0
CBL|General Tomas de Heres Airport|Ciudad Bolivar|VE|M0
CBM|Columbus Air Force Base|Columbus|US|M0
CBN|Cakrabhuwana  Airport|Cirebon-Java Island|ID|S0
CBO|Cotabato (Awang) Airport|Datu Odin Sinsuat|PH|M1
CBQ|Margaret Ekpo International Airport|Calabar|NG|M1
CBR|Canberra Airport|Canberra|AU|M1
CBS|Oro Negro Airport|Cabimas|VE|S0
CBT|Catumbela Airport|Catumbela|AO|M1
CBV|Coban Airport|Coban|GT|M0
CBW|Campo Mourão Airport|Campo Mourão|BR|S0
CBX|Condobolin Airport||AU|S0
CBY|Canobie Airport|Canobie|AU|S0
CBZ|Binzhou Dagao General Aviation Airport|Binzhou|CN|S0
CCA|Chimore Airport|Chimore|BO|S1
CCB|Upland-Cable Airport|Upland|US|S0
CCC|Jardines Del Rey Airport|Cayo Coco|CU|M1
CCE|Capital International Airport|New Cairo|EG|M1
CCF|Carcassonne Salvaza Airport|Carcassonne|FR|M1
CCG|Crane County Airport|Crane|US|S0
CCH|Chile Chico Airport|Chile Chico|CL|M0
CCI|Olavo Cecco Rigon Airport|Concórdia|BR|S0
CCJ|Calicut International Airport|Calicut|IN|L1
CCK|Cocos (Keeling) Islands Airport|West Island|CC|L1
CCL|Chinchilla Airport|Chinchilla|AU|M0
CCM|Forquilhinha - Criciúma  Airport|Criciúma|BR|M0
CCN|Chaghcharan Airport|Chaghcharan|AF|S0
CCO|Carimagua Airport|Puerto López|CO|S0
CCP|Carriel Sur International Airport|Concepcion|CL|L1
CCR|Buchanan Field|Concord|US|M1
CCS|Maiquetía Simón Bolívar International Airport|Maiquetía|VE|L1
CCU|Netaji Subhash Chandra Bose International Airport|Kolkata|IN|L1
CCV|Craig Cove Airport|Craig Cove|VU|S1
CCW|Cowell Airport||AU|S0
CCX|Cáceres Airport|Cáceres|BR|S0
CCY|Northeast Iowa Regional Airport|Charles City|US|M0
CCZ|Chub Cay Airport|Chub Cay|BS|M1
CDA|Cooinda Airport||AU|S0
CDB|Cold Bay Airport|Cold Bay|US|M1
CDC|Cedar City Regional Airport|Cedar City|US|M1
CDD|Cauquira Airport|Cauquira|HN|S0
CDE|Chengde Puning Airport|Chengde|CN|M1
CDG|Charles de Gaulle International Airport|Paris (Roissy-en-France, Val-d'Oise)|FR|L1
CDH|Harrell Field|Camden|US|S0
CDI|Cachoeiro do Itapemirim - Raimundo de Andrade Airport|Cachoeiro do Itapemirim|BR|S0
CDJ|Conceição do Araguaia Airport|Conceição do Araguaia|BR|M0
CDK|George T Lewis Airport|Cedar Key|US|S0
CDL|Candle 2 Airport|Candle|US|S0
CDN|Woodward Field|Camden|US|S0
CDO|Cradock Airport|Cradock|ZA|S0
CDP|Kadapa Airport|Kadapa|IN|M1
CDQ|Croydon Airport||AU|S0
CDR|Chadron Municipal Airport|Chadron|US|M1
CDS|Childress Municipal Airport|Childress|US|M0
CDT|Castellón-Costa Azahar Airport|Castellón de la Plana|ES|M1
CDU|Camden Airport|Cobbitty|AU|M0
CDV|Merle K (Mudhole) Smith Airport|Cordova|US|M1
CDW|Essex County Airport|Caldwell|US|S0
CDY|Cagayan de Sulu Airport|Mapun|PH|S0
CEA|Cessna Aircraft Field|Wichita|US|S0
CEB|Mactan Cebu International Airport|Cebu City/Lapu-Lapu City|PH|L1
CEC|Jack Mc Namara Field Airport|Crescent City|US|M1
CED|Ceduna Airport||AU|M1
CEE|Cherepovets Airport|Cherepovets|RU|M1
CEF|Westover Metropolitan Airport / Westover Air Reserve Base|Chicopee|US|M0
CEG|Hawarden Airport|Broughton|GB|M0
CEH|Chelinda Airfield||MW|S0
CEI|Mae Fah Luang - Chiang Rai International Airport|Chiang Rai|TH|L1
CEK|Kurchatov Chelyabinsk International Airport|Chelyabinsk|RU|L1
CEL|Canela Airport|Canela|BR|S1
CEM|Central Airport|Central|US|S1
CEN|Ciudad Obregón International Airport|Ciudad Obregón|MX|M1
CEO|Waco Kungo Airport|Waco Kungo|AO|S0
CEP|Concepción Airport|Concepción|BO|S0
CEQ|Cannes Mandelieu Airport|Cannes|FR|M0
CER|Cherbourg Manche airport|Cherbourg|FR|M0
CES|Cessnock Airport||AU|S0
CET|Cholet Le Pontreau airfield|Cholet|FR|S0
CEU|Oconee County Regional Airport|Clemson|US|S0
CEV|Mettel Field|Connersville|US|S0
CEW|Bob Sikes Airport|Crestview|US|M0
CEX|Chena Hot Springs Airport|Chena Hot Springs|US|S0
CEY|Murray-Calloway County Airport Kyle-Oakley Field|Murray|US|S0
CEZ|Cortez Municipal Airport|Cortez|US|M1
CFB|Cabo Frio Airport|Cabo Frio|BR|S1
CFC|Doctor Carlos Alberto da Costa Neves Airport|Caçador|BR|S0
CFD|Coulter Field|Bryan|US|S0
CFE|Clermont-Ferrand Auvergne airport|Clermont-Ferrand|FR|L1
CFF|Cafunfo Airport|Cafunfo|AO|S0
CFG|Jaime Gonzalez Airport|Cienfuegos|CU|M1
CFH|Clifton Hills Airport|Clifton Hills|AU|S0
CFI|Camfield Airport||AU|S0
CFK|Chlef Aboubakr Belkaid International Airport|Chlef|DZ|L1
CFM|Conklin (Leismer) Airport|Conklin|CA|S0
CFN|Donegal Airport|Donegal|IE|M1
CFO|Confresa Airport|Confresa|BR|S0
CFP|Carpentaria Downs Airport|Carpentaria Downs|AU|S0
CFQ|Creston Valley Regional Airport - Art Sutcliffe Field|Creston|CA|S0
CFR|Caen Carpiquet airport|Caen|FR|M1
CFS|Coffs Harbour Airport|Coffs Harbour|AU|M1
CFT|Greenlee County Airport|Clifton|US|S0
CFU|Corfu Ioannis Kapodistrias International Airport|Kerkyra (Corfu)|GR|L1
CFV|Coffeyville Municipal Airport|Coffeyville|US|S0
CGB|Várzea Grande–Marechal Rondon International Airport|Cuiabá|BR|L1
CGC|Cape Gloucester Airport|Cape Gloucester|PG|S0
CGD|Changde Taohuayuan Airport|Changde (Dingcheng)|CN|M1
CGE|Cambridge Dorchester Airport|Cambridge|US|S0
CGF|Cuyahoga County Airport|Cleveland|US|M0
CGG|Casiguran Airport|Casiguran|PH|S0
CGH|Congonhas–Deputado Freitas Nobre Airport|São Paulo|BR|L1
CGI|Cape Girardeau Regional Airport|Cape Girardeau|US|M1
CGJ|Kasompe Airport|Chingola|ZM|M0
CGK|Soekarno-Hatta International Airport|Jakarta|ID|L1
CGL|Chagual Airport||PE|S0
CGM|Camiguin Airport|Mambajao|PH|M1
CGN|Cologne Bonn Airport|Köln (Cologne)|DE|L1
CGO|Zhengzhou Xinzheng International Airport|Zhengzhou|CN|L1
CGP|Shah Amanat International Airport|Chattogram (Chittagong)|BD|L1
CGQ|Changchun Longjia International Airport|Changchun|CN|L1
CGR|Campo Grande Airport|Campo Grande|BR|M1
CGS|College Park Airport|College Park|US|S0
CGV|Caiguna Airport||AU|S0
CGX|Chunga Airstrip|Chunga|ZM|S0
CGY|Laguindingan International Airport|Laguindingan|PH|L1
CGZ|Casa Grande Municipal Airport|Casa Grande|US|S0
CHA|Chattanooga Metropolitan Airport (Lovell Field)|Chattanooga|US|M1
CHB|Chilas Airport|Chilas|PK|S0
CHC|Christchurch International Airport|Christchurch|NZ|L1
CHD|Mucugê Airport|Mucugê|BR|S0
CHF|Jinhae Air Base|Jinhae|KR|S0
CHG|Chaoyang Airport|Shuangta, Chaoyang|CN|M1
CHH|Chachapoyas Airport|Chachapoyas|PE|M1
CHJ|Chipinge Airport|Chipinge|ZW|S0
CHK|Chickasha Municipal Airport|Chickasha|US|S0
CHL|Challis Airport|Challis|US|S0
CHM|FAP Lieutenant Jaime Andres de Montreuil Morales Airport|Chimbote|PE|M1
CHN|Jeonju (G 703) Air Base|Jeonju|KR|S0
CHO|Charlottesville Albemarle Airport|Charlottesville|US|M1
CHP|Circle Hot Springs Airport|Circle Hot Springs|US|S0
CHQ|Chania International Airport|Souda|GR|L1
CHR|Châteauroux Déols airport|Châteauroux|FR|M0
CHS|Charleston International Airport|Charleston|US|L1
CHT|Inia William Tuuta Memorial Airport|Te One|NZ|M1
CHU|Chuathbaluk Airport|Chuathbaluk|US|S1
CHX|Changuinola Captain Manuel Niño International Airport|Changuinola|PA|M1
CHY|Choiseul Bay Airport|Choiseul Bay|SB|S1
CHZ|Chiloquin State Airport|Chiloquin|US|S0
CIA|Ciampino–G. B. Pastine International Airport|Rome|IT|L1
CIC|Chico Regional Airport|Chico|US|S0
CID|The Eastern Iowa Airport|Cedar Rapids|US|M1
CIE|Collie Airport|Collie|AU|S0
CIF|Chifeng Yulong Airport|Chifeng|CN|M1
CIG|Craig Moffat Airport|Craig|US|S0
CIH|Changzhi Wangcun Airport|Changzhi|CN|S1
CII|Aydın Çıldır Airport|Aydın|TR|S0
CIJ|Capitán Aníbal Arab Airport|Cobija|BO|M1
CIK|Chalkyitsik Airport|Chalkyitsik|US|S1
CIL|Council Airport|Council|US|S0
CIM|Cimitarra Airport|Cimitarra|CO|S0
CIN|Arthur N Neu Airport|Carroll|US|S0
CIO|Lieutenant Colonel Carmelo Peralta National Airport|Concepción|PY|M0
CIP|Chipata Airport|Chipata|ZM|S0
CIQ|Chiquimula Airport|Chiquimula|GT|S0
CIR|Cairo Regional Airport|Cairo|US|S0
CIS|Canton Island Airport|Abariringa|KI|M0
CIT|Shymkent International Airport|Shymkent|KZ|L1
CIU|Chippewa County International Airport|Kincheloe|US|M1
CIW|Canouan Airport|Canouan|VC|M1
CIX|Capitán FAP José A. Quiñones González International Airport|Chiclayo|PE|L1
CIY|Comiso Airport|Comiso|IT|M1
CIZ|Danilson Municipal Airport|Coari|BR|S0
CJA|Mayor General FAP Armando Revoredo Iglesias Airport|Cajamarca|PE|M1
CJB|Coimbatore International Airport|Coimbatore|IN|L1
CJC|El Loa Airport|Calama|CL|M1
CJD|Candilejas Airport|Candilejas|CO|S0
CJF|Coondewanna Airport|Coondewanna|AU|S0
CJH|Chilko Lake (Tsylos Park Lodge) Airport|Chilko Lake|CA|S0
CJJ|Cheongju International Airport/Cheongju Air Base (K-59/G-513)|Cheongju|KR|L1
CJL|Chitral Airport|Chitral|PK|M1
CJM|Chumphon Airport|Chumphon|TH|M1
CJN|Nusawiru Airport|Cijulang|ID|S1
CJS|Abraham González International Airport|Ciudad Juárez|MX|L1
CJT|San Antonio Copalar Airport|Comitán|MX|S0
CJU|Jeju International Airport|Jeju City|KR|L1
CJZ|Pedro Vieira Moreira Airport|Cajazeiras|BR|S1
CKA|Kegelman AF Aux Field|Cherokee|US|S0
CKB|North Central West Virginia Airport|Bridgeport|US|M1
CKC|Cherkasy International Airport|Cherkasy|UA|M0
CKD|Crooked Creek Airport|Crooked Creek|US|S1
CKE|Lampson Field|Lakeport|US|S0
CKG|Chongqing Jiangbei International Airport|Chongqing|CN|L1
CKH|Chokurdakh Airport|Chokurdah|RU|M1
CKI|Croker Island Airport||AU|S0
CKK|Sharp County Regional Airport|Ash Flat|US|S0
CKL|Chkalovskiy Air Base|Moscow|RU|M0
CKM|Fletcher Field|Clarksdale|US|S0
CKN|Crookston Municipal Kirkwood Field|Crookston|US|S0
CKO|Cornélio Procópio Airport|Cornélio Procópio|BR|S0
CKR|Crane Island Airstrip|Crane Island|US|S0
CKS|Carajás Airport|Parauapebas|BR|M1
CKT|Sarakhs Airport|Sarakhs|IR|M0
CKU|Cordova Municipal Airport|Cordova|US|S0
CKV|Clarksville–Montgomery County Regional Airport|Clarksville|US|S0
CKW|Christmas Creek Airport|Christmas Creek Mine|AU|S1
CKX|Chicken Airport|Chicken|US|S1
CKY|Ahmed Sékou Touré International Airport|Conakry|GN|L1
CKZ|Çanakkale Airport|Çanakkale|TR|M1
CLA|Comilla Airport|Comilla|BD|S0
CLD|McClellan-Palomar Airport|Carlsbad|US|M1
CLE|Cleveland Hopkins International Airport|Cleveland|US|L1
CLG|New Coalinga Municipal Airport|Coalinga|US|S0
CLH|Coolah Airport||AU|S0
CLI|Clintonville Municipal Airport|Clintonville|US|S0
CLJ|Avram Iancu Cluj International Airport|Cluj-Napoca|RO|L1
CLK|Clinton Regional Airport|Clinton|US|S0
CLL|Easterwood Field|College Station|US|M1
CLM|William R Fairchild International Airport|Port Angeles|US|M0
CLN|Brig. Lysias Augusto Rodrigues Airport|Carolina|BR|M0
CLO|Alfonso Bonilla Aragon International Airport|Cali|CO|L1
CLP|Clarks Point Airport|Clarks Point|US|S1
CLQ|Licenciado Miguel de la Madrid International Airport|Colima|MX|M1
CLR|Cliff Hatfield Memorial Airport|Calipatria|US|S0
CLS|Chehalis Centralia Airport|Chehalis|US|S0
CLT|Charlotte Douglas International Airport|Charlotte|US|L1
CLU|Columbus Municipal Airport|Columbus|US|M0
CLV|Nelson Ribeiro Guimarães Airport|Caldas Novas|BR|S1
CLW|Clearwater Air Park|Clearwater|US|S0
CLX|Aeródromo de Clorinda|Clorinda|AR|S0
CLY|Calvi Sainte Catherine Airport|Calvi|FR|M1
CLZ|Calabozo Airport|Guarico|VE|M0
CMA|Cunnamulla Airport||AU|M1
CMB|Bandaranaike International Colombo Airport|Colombo|LK|L1
CMC|Camocim - Pinto Martins Airport|Camocim|BR|S0
CMD|Cootamundra Airport||AU|M0
CME|Ciudad del Carmen International Airport|Ciudad del Carmen|MX|M1
CMF|Chambéry Aix les Bains airport|Chambéry|FR|M1
CMG|Corumbá International Airport|Corumbá|BR|M1
CMH|John Glenn Columbus International Airport|Columbus|US|L1
CMI|University of Illinois Willard Airport|Savoy|US|M1
CMJ|Qimei Airport|Qimei|TW|S0
CMK|Club Makokola Airport|Club Makokola|MW|S0
CML|Camooweal Airport||AU|S0
CMM|Carmelita Airport|Carmelita|GT|S0
CMN|Mohammed V International Airport|Casablanca|MA|L1
CMO|Hobyo Airport|Hobyo|SO|S0
CMP|Santana do Araguaia Airport|Santana do Araguaia|BR|S0
CMQ|Clermont Airport||AU|M0
CMR|Colmar Houssen airport|Colmar|FR|M0
CMS|Iskushuban Airport|Iskushuban|SO|S0
CMT|New Cametá Airport|Cametá|BR|S0
CMU|Chimbu Airport|Kundiawa|PG|M1
CMV|Coromandel Airport|Coromandel|NZ|S0
CMW|Ignacio Agramonte International Airport|Camaguey|CU|L1
CMX|Houghton County Memorial Airport|Hancock|US|M1
CMY|Sparta Fort McCoy Airport|Sparta|US|S0
CMZ|Caia Airport|Caia|MZ|S0
CNA|Cananea National Airport|Cananea|MX|S0
CNB|Coonamble Airport||AU|M1
CNC|Coconut Island Airport||AU|S1
CND|Mihail Kogălniceanu International Airport|Constanța|RO|L1
CNE|Fremont County Airport|Penrose|US|S0
CNF|Tancredo Neves International Airport|Belo Horizonte|BR|L1
CNG|Cognac-Châteaubernard (BA 709) Air Base|Cognac/Châteaubernard|FR|M0
CNH|Claremont Municipal Airport|Claremont|US|S0
CNI|Changhai Dachangshandao Airport|Dalian (Changhai)|CN|S1
CNJ|Cloncurry Airport|Cloncurry|AU|M1
CNK|Blosser Municipal Airport|Concordia|US|S0
CNL|Sindal Airport|Sindal|DK|M0
CNM|Cavern City Air Terminal|Carlsbad|US|M1
CNN|Kannur International Airport|Kannur|IN|L1
CNO|Chino Airport|Chino|US|S0
CNP|Neerlerit Inaat Airport|Neerlerit Inaat|GL|M1
CNQ|Corrientes Airport|Corrientes|AR|M1
CNR|Chañaral Airport|Chañaral|CL|M0
CNS|Cairns International Airport|Cairns|AU|L1
CNT|Charata Airport|Charata|AR|S0
CNU|Chanute Martin Johnson Airport|Chanute|US|M0
CNV|Sócrates Rezende Airport|Canavieiras|BR|S0
CNW|TSTC Waco Airport|Waco|US|S0
CNX|Chiang Mai International Airport|Chiang Mai|TH|L1
CNY|Canyonlands Regional Airport|Moab|US|M1
CNZ|Cangamba Airport|Cangamba|AO|S0
COA|Columbia Airport|Columbia|US|S0
COB|Coolibah Airport|Coolibah|AU|S0
COC|Comodoro Pierrestegui Airport|Concordia|AR|M0
COD|Yellowstone Regional Airport|Cody|US|M1
COE|Coeur D'Alene Airport - Pappy Boyington Field|Coeur d'Alene|US|M0
COF|Patrick Space Force Base|Cocoa Beach|US|M0
COG|Mandinga Airport|Condoto|CO|S0
COH|Cooch Behar Airport|Cooch Behar|IN|S0
COI|Merritt Island Airport|Merritt Island|US|S0
COJ|Coonabarabran Airport||AU|M0
COK|Cochin International Airport|Kochi|IN|L1
COL|Coll Airport|Coll Island|GB|S1
COM|Coleman Municipal Airport|Coleman|US|S0
CON|Concord Municipal Airport|Concord|US|M0
COO|Cotonou Cadjehoun International Airport|Cotonou|BJ|L1
COP|Cooperstown-Westville Airport|Cooperstown|US|S0
COQ|Choibalsan Airport||MN|M1
COR|Ingeniero Aeronáutico Ambrosio L.V. Taravella International Airport|Cordoba|AR|L1
COS|City of Colorado Springs Municipal Airport|Colorado Springs|US|L1
COT|Cotulla-La Salle County Airport|Cotulla|US|S0
COU|Columbia Regional Airport|Columbia|US|M1
COV|Çukurova International Airport|Tarsus|TR|L1
COW|Tambillos Airport|Coquimbo|CL|S0
COY|Coolawanyah Airport|Coolawanyah Station|AU|S0
COZ|Constanza - Expedición 14 de Junio National Airport|Costanza|DO|S0
CPA|Cape Palmas Airport|Harper|LR|S0
CPB|Capurganá Airport|Acandí|CO|S0
CPC|Aviador C. Campos Airport|Chapelco/San Martin de los Andes|AR|M1
CPD|Coober Pedy Airport|Coober Pedy|AU|M1
CPE|Ingeniero Alberto Acuña Ongay International Airport|Campeche|MX|M1
CPF|Ngloram Airport|Blora|ID|S0
CPG|Carmen de Patagones Airport|Carmen de Patagones|AR|S0
CPH|Copenhagen Kastrup Airport|Copenhagen|DK|L1
CPI|Cape Orford Airport||PG|S0
CPL|General Navas Pardo Airport|Chaparral|CO|S0
CPM|Compton Woodley Airport|Compton|US|S0
CPN|Cape Rodney Airport|Cape Rodney|PG|S0
CPO|Desierto de Atacama Airport|Copiapo|CL|M1
CPP|Coposa Airport|Pica|CL|S0
CPR|Casper-Natrona County International Airport|Casper|US|M1
CPS|St Louis Downtown Airport|Cahokia/St Louis|US|S0
CPT|Cape Town International Airport|Cape Town|ZA|L1
CPU|Cururupu Airport|Cururupu|BR|S0
CPV|Presidente João Suassuna Airport|Campina Grande|BR|M1
CPX|Benjamin Rivera Noriega Airport|Culebra|PR|M1
CQA|Canarana Airport|Canarana|BR|S0
CQD|Shahrekord Airport|Shahrekord|IR|M0
CQF|Calais Marck Airport|Calais|FR|M0
CQM|Ciudad Real International Airport|Ciudad Real|ES|M0
CQP|Cape Flattery Airport||AU|S0
CQS|Costa Marques Airport|Costa Marques|BR|S0
CQT|Caquetania Airport|Caquetania|CO|S0
CQW|Chongqing Xiannüshan Airport|Wulong|CN|M1
CRA|Craiova International Airport|Craiova|RO|L1
CRB|Collarenebri Airport||AU|S0
CRC|Santa Ana Airport|Cartago|CO|M0
CRD|General Enrique Mosconi International Airport|Comodoro Rivadavia|AR|L1
CRE|Grand Strand Airport|North Myrtle Beach|US|M0
CRF|Carnot Airport|Carnot|CF|S0
CRG|Jacksonville Executive at Craig Airport|Jacksonville|US|M0
CRH|Cherrabah Airport|Cherrabah Homestead Resort|AU|S0
CRI|Colonel Hill Airport|Colonel Hill|BS|M1
CRJ|Coorabie Airport|Coorabie|AU|S0
CRK|Clark International Airport / Clark Air Base|Mabalacat|PH|L1
CRL|Brussels South Charleroi Airport|Charleroi|BE|L1
CRM|Catarman National Airport|Catarman|PH|M1
CRO|Corcoran Airport|Corcoran|US|S0
CRP|Corpus Christi International Airport|Corpus Christi|US|M1
CRQ|Caravelas Airport|Caravelas|BR|M0
CRR|Ceres Airport|Ceres|AR|S0
CRS|C David Campbell Field Corsicana Municipal Airport|Corsicana|US|S0
CRT|Z M Jack Stell Field|Crossett|US|S0
CRU|Lauriston Airport|Carriacou Island|GD|S1
CRV|Crotone Sant'Anna Pythagoras Airport|Isola di Capo Rizzuto (KR)|IT|M1
CRW|Yeager Airport|Charleston|US|M1
CRX|Roscoe Turner Airport|Corinth|US|S0
CRY|Carlton Hill Airport|Carlton Hill|AU|S0
CRZ|Türkmenabat International Airport|Türkmenabat|TM|L1
CSA|Colonsay Airstrip|Colonsay|GB|S1
CSB|Caransebeş Airport|Caransebeş|RO|M0
CSC|Mojica Airport|Cañas|CR|S0
CSD|Cresswell Downs Airport|Cresswell Downs|AU|S0
CSE|Crested Butte Airpark|Crested Butte|US|S0
CSF|Creil Air Base|Creil|FR|M0
CSG|Columbus Airport|Columbus|US|M1
CSH|Solovki Airport|Solovetsky Islands|RU|S1
CSI|Casino Airport||AU|S0
CSK|Cap Skirring Airport|Cap Skirring|SN|M1
CSM|Clinton Sherman Airport|Clinton|US|S0
CSN|Carson Airport|Carson City|US|M0
CSO|Cochstedt Airport|Hecklingen|DE|S0
CSQ|Creston Municipal Airport|Creston|US|S0
CSR|Casuarito Airport|Casuarito|CO|S0
CSS|Cassilândia Airport|Cassilândia|BR|S0
CSU|Santa Cruz do Sul Airport|Santa Cruz do Sul|BR|S0
CSV|Crossville Memorial Airport Whitson Field|Crossville|US|M0
CSW|Cabo San Lucas International Airport|Cabo San Lucas|MX|M1
CSX|Changsha Huanghua International Airport|Changsha (Changsha)|CN|L1
CSY|Cheboksary Airport|Cheboksary|RU|M1
CSZ|Brigadier D.H.E. Ruiz Airport|Coronel Suarez|AR|S0
CTA|Catania-Fontanarossa Airport|Catania|IT|L1
CTB|Cut Bank International Airport|Cut Bank|US|M0
CTC|Coronel Felipe Varela International Airport|Catamarca|AR|M1
CTD|Alonso Valderrama Airport|Chitré|PA|M1
CTE|Cartí Airport|Cartí Islands|PA|S0
CTF|Coatepeque Airport|Coatepeque|GT|S0
CTG|Rafael Nuñez International Airport|Cartagena|CO|L1
CTH|Chester County G O Carlson Airport|Coatesville|US|S0
CTI|Cuito Cuanavale Airport|Cuito Cuanavale|AO|S0
CTK|Canton Municipal Airport|Canton|US|S0
CTL|Charleville Airport|Charleville|AU|M1
CTM|Chetumal International Airport|Chetumal|MX|M1
CTN|Cooktown Airport||AU|M1
CTO|Calverton Executive Airpark|Calverton|US|S0
CTP|Carutapera Airport|Carutapera|BR|S0
CTQ|Santa Vitória do Palmar Airport|Santa Vitória do Palmar|BR|S0
CTR|Cattle Creek Airport||AU|S0
CTS|New Chitose Airport|Sapporo|JP|L1
CTT|Le Castellet Airport|Le Castellet, Var|FR|M0
CTU|Chengdu Shuangliu International Airport|Chengdu (Shuangliu)|CN|L1
CTV|Catoca Airport|Saurimo|AO|S0
CTW|Cottonwood Airport|Cottonwood|US|S0
CTX|Cortland County Chase Field|Cortland|US|S0
CTY|Cross City Airport|Cross City|US|S0
CTZ|Sampson County Airport|Clinton|US|S0
CUA|Ciudad Constitución National Airport|Comondú|MX|S1
CUB|Jim Hamilton L.B. Owens Airport|Columbia|US|M0
CUC|Camilo Daza International Airport|Cúcuta|CO|M1
CUD|Caloundra Airport|Caloundra|AU|S0
CUE|Mariscal Lamar Airport|Cuenca|EC|M1
CUF|Cuneo International Airport|Levaldigi (CN)|IT|M1
CUG|Cudal Airport||AU|S0
CUH|Cushing Municipal Airport|Cushing|US|S0
CUI|Currillo Airport|Currillo|CO|S0
CUJ|Culion Airport|Culion|PH|S0
CUK|Caye Caulker Airport|Caye Caulker|BZ|M1
CUL|Bachigualato Federal International Airport|Culiacán|MX|L1
CUM|Antonio José de Sucre Airport|Cumaná|VE|M1
CUN|Cancún International Airport|Cancún|MX|L1
CUO|Carurú Airport|Carurú|CO|S0
CUP|General Francisco Bermúdez Airport|Carúpano|VE|M1
CUQ|Coen Airport|Coen|AU|M1
CUR|Hato International Airport|Willemstad|CW|L1
CUS|Columbus Airport|Columbus|US|S0
CUT|Cutral-Co Airport|Cutral-Co|AR|M0
CUU|General Roberto Fierro Villalobos International Airport|Chihuahua|MX|L1
CUV|Casigua El Cubo Airport|Casigua El Cubo|VE|S0
CUY|Cue Airport||AU|S0
CUZ|Alejandro Velasco Astete International Airport|Cusco|PE|L1
CVB|Chungribu Airport|Chungribu|PG|S0
CVC|Cleve Airport||AU|M0
CVE|Coveñas Airport|Coveñas|CO|M0
CVF|Courchevel Altiport|Saint-Bon|FR|S0
CVG|Cincinnati Northern Kentucky International Airport|Cincinnati / Covington|US|L1
CVH|Caviahue Airport|Lafontaine|AR|S0
CVI|Caleta Olivia Airport|Caleta Olivia|AR|S0
CVJ|General Mariano Matamoros International Airport|Temixco|MX|M0
CVL|Cape Vogel Airport||PG|S0
CVM|General Pedro Jose Mendez International Airport|Ciudad Victoria|MX|M1
CVN|Clovis Municipal Airport|Clovis|US|M1
CVO|Corvallis Municipal Airport|Corvallis|US|M0
CVQ|Carnarvon Airport|Carnarvon|AU|M1
CVS|Cannon Air Force Base|Clovis|US|M0
CVU|Corvo Airport|Corvo|PT|S1
CWA|Central Wisconsin Airport|Mosinee|US|M1
CWB|Curitiba-Afonso Pena International Airport|Curitiba|BR|L1
CWC|Chernivtsi International Airport|Chernivtsi|UA|M0
CWF|Chennault International Airport|Lake Charles|US|S0
CWI|Clinton Municipal Airport|Clinton|US|S0
CWJ|Cangyuan Washan Airport|Lincang (Cangyuan)|CN|M1
CWK|Chitrakoot Airport|Chitrakoot|IN|S0
CWL|Cardiff International Airport|Cardiff|GB|L1
CWR|Cowarie Airport||AU|S0
CWS|Center Island Airport|Center Island|US|S1
CWT|Cowra Airport||AU|M0
CWW|Corowa Airport||AU|M0
CWX|Cochise County Airport|Willcox|US|S0
CXA|Caicara del Orinoco Airport||VE|M0
CXB|Cox's Bazar Airport|Cox's Bazar|BD|M1
CXC|Chitina Airport|Chitina|US|S0
CXF|Coldfoot Airport|Coldfoot|US|S0
CXI|Cassidy International Airport|Kiritimati|KI|L1
CXJ|Hugo Cantergiani Regional Airport|Caxias Do Sul|BR|M1
CXL|Calexico International Airport|Calexico|US|S0
CXN|Candala Airport|Candala|SO|S0
CXO|Conroe-North Houston Regional Airport|Houston|US|M0
CXP|Tunggul Wulung Airport|Cilacap|ID|M1
CXQ|Christmas Creek Station Airport|Wangkat Jungka|AU|S0
CXR|Cam Ranh International Airport / Cam Ranh Air Base|Nha Trang/nha Trang aiurportCam Ranh|VN|L1
CXT|Charters Towers Airport||AU|S0
CXY|Cat Cay Airport|North Cat Cay|BS|S0
CYA|Antoine-Simon International Airport|Les Cayes|HT|M1
CYB|Charles Kirkconnell International Airport|West End|KY|M1
CYC|Caye Chapel Airport|Caye Chapel|BZ|M1
CYD|San Ignacio Town (Maya Flats) Airstrip|Maya Flats|BZ|S0
CYF|Chefornak Airport|Chefornak|US|S1
CYG|Corryong Airport||AU|M0
CYI|Chiayi Airport|Shuishang|TW|M1
CYL|Coyoles Airport|Coyoles|HN|S0
CYO|Vilo Acuña International Airport|Cayo Largo del Sur|CU|M1
CYP|Calbayog Airport|Calbayog City|PH|M1
CYR|Colonia Laguna de Los Patos International Airport|Colonia del Sacramento|UY|S0
CYS|Cheyenne Regional Jerry Olson Field|Cheyenne|US|M1
CYT|Yakataga Airport|Yakataga|US|S1
CYU|Cuyo Airport|Cuyo|PH|S1
CYW|Captain Rogelio Castillo National Airport|Celaya|MX|M0
CYX|Cherskiy Airport|Cherskiy|RU|M1
CYZ|Cauayan Airport|Cauayan City|PH|M1
CZA|Chichén Itzá International Airport|Tinúm|MX|S0
CZB|Carlos Ruhl Airport|Cruz Alta|BR|S0
CZC|Copper Center 2 Airport|Copper Center|US|S0
CZE|José Leonardo Chirinos Airport|Coro|VE|M1
CZF|Cape Romanzof LRRS Airport|Cape Romanzof|US|M0
CZH|Corozal Airport|Corozal|BZ|M1
CZJ|Corazón de Jesús Airport|Tupile|PA|S0
CZK|Cascade Locks State Airport|Cascade Locks|US|S0
CZL|Mohamed Boudiaf International Airport|Constantine|DZ|L1
CZM|Cozumel International Airport|Cozumel|MX|L1
CZN|Chisana Airport|Chisana|US|S0
CZO|Chistochina Airport|Chistochina|US|S0
CZR|Chara Airport|Chara|RU|S0
CZS|Cruzeiro do Sul Airport|Cruzeiro Do Sul|BR|M1
CZT|Dimmit County Airport|Carrizo Springs|US|S0
CZU|Las Brujas Airport|Corozal|CO|M1
CZX|Changzhou Benniu International Airport|Changzhou|CN|M1
CZY|Cluny Airport||AU|S0
DAA|Davison Army Air Field|Fort Belvoir|US|M0
DAB|Daytona Beach International Airport|Daytona Beach|US|M1
DAC|Hazrat Shahjalal International Airport|Dhaka|BD|L1
DAD|Da Nang International Airport|Da Nang|VN|L1
DAF|Daup Airport||PG|S0
DAG|Barstow Daggett Airport|Daggett|US|M0
DAH|Dathina Airport|Dathina|YE|S0
DAK|Dakhla Oasis Airport|Dakhla Oases|EG|S0
DAL|Dallas Love Field|Dallas|US|L1
DAM|Damascus International Airport|Damascus|SY|L1
DAN|Danville Regional Airport|Danville|US|M0
DAO|Dabo Airport||PG|S0
DAP|Darchula Airport|Darchula|NP|S0
DAR|Julius Nyerere International Airport|Dar es Salaam|TZ|L1
DAS|Great Bear Lake Airport|Great Bear Lake|CA|S0
DAT|Datong Yungang International Airport|Datong|CN|L1
DAU|Daru Airport|Daru|PG|M1
DAV|Enrique Malek International Airport|David|PA|M1
DAX|Dachuan Airport|Dazhou (Daxian)|CN|S1
DAY|James M. Cox Dayton International Airport|Dayton|US|M1
DAZ|Darwaz Airport|Darwaz|AF|S0
DBA|Dalbandin Airport|Dalbandin|PK|S1
DBB|El Alamein International Airport|El Alamein|EG|L1
DBC|Baicheng Chang'an Airport|Baicheng|CN|M1
DBD|Dhanbad Airport||IN|M0
DBM|Debre Markos Airport|Debre Markos|ET|S1
DBN|W H 'Bud' Barron Airport|Dublin|US|S0
DBO|Dubbo City Regional Airport|Dubbo|AU|M1
DBP|Debepare Airport|Debepare|PG|S0
DBQ|Dubuque Regional Airport|Dubuque|US|M1
DBR|Darbhanga Airport|Darbhanga|IN|M1
DBS|Dubois Municipal Airport|Dubois|US|S0
DBT|Debre Tabor Airport|Debre Tabor|ET|S0
DBV|Dubrovnik Ruđer Bošković Airport|Dubrovnik|HR|L1
DBY|Dalby Airport||AU|S0
DCA|Ronald Reagan Washington National Airport|Washington|US|L1
DCF|Canefield Airport|Canefield|DM|M1
DCI|Decimomannu Air Base|Decimomannu|IT|M0
DCK|Dahl Creek Airport|Dahl Creek|US|S0
DCM|Castres Mazamet Airport|Castres|FR|M1
DCN|RAAF Base Curtin|Derby|AU|M0
DCT|Duncan Town Airport|Duncan Town|BS|M0
DCU|Pryor Field Regional Airport|Decatur|US|S0
DCY|Daocheng Yading Airport|Garzê (Daocheng)|CN|M1
DDC|Dodge City Regional Airport|Dodge City|US|M1
DDD|Dhaalu Atoll Airport|Kudahuvadhoo|MV|S0
DDG|Dandong Langtou International Airport|Dandong (Zhenxing)|CN|M1
DDM|Dodoima Airport||PG|S0
DDN|Delta Downs Airport||AU|S0
DDR|Shigatse Tingri Airport|Xigazê (Dingri)|CN|M1
DDU|Dadu West Airport|Dadu|PK|S0
DEA|Dera Ghazi Khan Airport|Dera Ghazi Khan|PK|M1
DEB|Debrecen International Airport|Debrecen|HU|L1
DEC|Decatur Airport|Decatur|US|M1
DED|Dehradun Jolly Grant Airport|Dehradun (Jauligrant)|IN|M1
DEE|Yuzhno-Kurilsk Mendeleyevo Airport|Yuzhno-Kurilsk|RU|S1
DEF|Dezful Airport|Dezful|IR|M1
DEH|Decorah Municipal Airport|Decorah|US|S0
DEI|Denis Island Airport|Denis Island|SC|S0
DEJ|Tongren Dejiang Airport (Under Construction)|Tongren|CN|M0
DEL|Indira Gandhi International Airport|New Delhi|IN|L1
DEM|Dembidollo Airport|Dembidollo|ET|S1
DEN|Denver International Airport|Denver|US|L1
DEP|Daporijo Airport|Daporijo|IN|S0
DEQ|Deqing Moganshan Airport|Huzhou|CN|S0
DER|Derim Airport|Derim|PG|S0
DES|Desroches Airport|Desroches Island|SC|S0
DET|Coleman A. Young Municipal Airport|Detroit|US|M0
DEX|Nop Goliat Dekai Airport|Dekai|ID|S1
DEZ|Deir ez-Zor Airport|Deir ez-Zor|SY|M0
DFA|Shangluo Airport|Shangluo (Danfeng)|CN|S0
DFI|Defiance Memorial Airport|Defiance|US|S0
DFP|Drumduff Airport|Palmer|AU|S0
DFW|Dallas Fort Worth International Airport|Dallas-Fort Worth|US|L1
DGA|Dangriga Airport|Dangriga|BZ|M1
DGD|Dalgaranga Gold Mine Airport||AU|S0
DGE|Mudgee Airport|Mudgee|AU|M0
DGF|Douglas Lake Airport|Douglas Lake|CA|S0
DGH|Deoghar Airport|Deoghar|IN|S1
DGL|Douglas Municipal Airport|Douglas|US|S0
DGN|Dahlgren Naval Surface Warfare Center Airport|Dahlgren|US|S0
DGO|General Guadalupe Victoria International Airport|Durango|MX|M1
DGR|Dargaville Aerodrome|Dargaville|NZ|S0
DGT|Sibulan Airport|Dumaguete City|PH|M1
DGU|Dedougou Airport|Dedougou|BF|S0
DGW|Converse County Airport|Douglas|US|S0
DHA|King Abdulaziz Air Base|Dhahran|SA|L0
DHD|Durham Downs Airport||AU|S0
DHF|Al Dhafra Air Base||AE|M0
DHG|Dalnegorsk Airport|Dalnegorsk|RU|S0
DHH|Barkol Dahe Airport|Barkol|CN|M0
DHI|Dhangarhi Airport|Dhangarhi|NP|S0
DHM|Kangra Airport|Kangra|IN|M1
DHN|Dothan Regional Airport|Dothan|US|M1
DHR|De Kooy Airfield / Den Helder Naval Air Station|Den Helder|NL|M0
DHT|Dalhart Municipal Airport|Dalhart|US|M0
DHX|Dhoho International Airport|Kediri|ID|M1
DIA|Doha International Airport|Doha|QA|L1
DIB|Dibrugarh Airport|Dibrugarh|IN|M1
DIE|Arrachart Airport|Antisiranana|MG|M1
DIG|Diqing Shangri-La Airport|Diqing (Shangri-La)|CN|M1
DIJ|Dijon Longvic airport|Dijon|FR|M0
DIK|Dickinson Theodore Roosevelt Regional Airport|Dickinson|US|M1
DIL|Presidente Nicolau Lobato International Airport|Dili|TL|L1
DIM|Dimbokro Airport|Dimbokro|CI|S0
DIN|Dien Bien Phu Airport|Dien Bien Phu|VN|M1
DIP|Diapaga Airport|Diapaga|BF|S0
DIQ|Brigadeiro Cabral Airport|Divinópolis|BR|S0
DIR|Aba Tenna Dejazmach Yilma International Airport|Dire Dawa|ET|L1
DIS|Ngot Nzoungou Airport|Dolisie|CG|M0
DIU|Diu Airport|Diu|IN|S1
DIY|Diyarbakır Airport|Diyarbakır|TR|M1
DJA|Djougou Airport|Djougou|BJ|S0
DJB|Sultan Thaha Airport|Jambi|ID|S1
DJE|Djerba Zarzis International Airport|Mellita|TN|L1
DJG|Tiska Djanet Airport|Djanet|DZ|L1
DJJ|Dortheys Hiyo Eluay International Airport|Sentani|ID|L1
DJM|Djambala Airport|Djambala|CG|S0
DJN|Delta Junction Airport|Delta Junction|US|S0
DJO|Daloa Airport||CI|M0
DJR|Dajarra Airport||AU|S0
DJT|President Donald J. Trump International Airport|West Palm Beach|US|L1
DJU|Djúpivogur Airport|Djúpivogur|IS|S0
DKA|Umaru Musa Yar'adua Airport|Katsina|NG|M1
DKI|Dunk Island Airport|Dunk Island|AU|S0
DKK|Chautauqua County-Dunkirk Airport|Dunkirk|US|S0
DKR|Léopold Sédar Senghor International Airport|Dakar|SN|L0
DKS|Dikson Airport|Dikson|RU|M0
DKV|Docker River Airport|Kaltukatjara|AU|S0
DLA|Douala International Airport|Douala|CM|L1
DLC|Dalian Zhoushuizi International Airport|Dalian (Ganjingzi)|CN|L1
DLE|Dole Tavaux Airport|Dole|FR|M1
DLF|Laughlin Air Force Base|Del Rio|US|M0
DLG|Dillingham Airport|Dillingham|US|M1
DLH|Duluth International Airport|Duluth|US|M1
DLI|Lien Khuong Airport|Da Lat|VN|M1
DLK|Dulkaninna Airport|Dulkaninna|AU|S0
DLL|Dillon County Airport|Dillon|US|S0
DLM|Dalaman International Airport|Dalaman|TR|L1
DLN|Dillon Airport|Dillon|US|S0
DLR|Dalnerechensk Airport|Dalnerechensk|RU|S1
DLS|Columbia Gorge Regional Airport|Dallesport / The Dalles|US|M0
DLU|Dali Fengyi Airport|Dali (Xiaguan)|CN|M1
DLV|Delissaville Airport||AU|S0
DLY|Dillon's Bay Airport|Dillon's Bay|VU|S0
DLZ|Dalanzadgad Airport|Dalanzadgad|MN|M1
DMA|Davis Monthan Air Force Base|Tucson|US|M0
DMB|Taraz International Airport|Taraz|KZ|L1
DMD|Doomadgee Airport||AU|S1
DME|Domodedovo International Airport|Moscow|RU|L1
DMK|Don Mueang International Airport|Bangkok|TH|L1
DMM|King Fahd International Airport|Ad Dammam|SA|L1
DMN|Deming Municipal Airport|Deming|US|M0
DMO|Sedalia Memorial Airport|Sedalia|US|S0
DMT|Diamantino Airport|Diamantino|BR|S0
DMU|Dimapur Airport|Dimapur|IN|M1
DNA|Kadena Air Base|Okinawa|JP|L0
DNB|Dunbar Airport|Maramie|AU|S0
DND|Dundee Airport|Dundee|GB|M1
DNF|Martuba Air Base|Martuba|LY|S0
DNG|Doongan Airport|Drysdale River|AU|S0
DNH|Dunhuang Mogao International Airport|Dunhuang|CN|L1
DNK|Dnipro International Airport|Dnipro|UA|M0
DNL|Daniel Field|Augusta|US|M0
DNN|Dalton Municipal Airport|Dalton|US|S0
DNO|Dianópolis Airport|Dianópolis|BR|S0
DNP|Tulsipur Airport|Dang|NP|S0
DNQ|Deniliquin Airport|Deniliquin|AU|M0
DNR|Dinard Pleurtuit Saint-Malo airport|Dinard|FR|M0
DNS|Denison Municipal Airport|Denison|US|S0
DNU|Dinangat Airport|Dinangat|PG|S0
DNV|Vermilion Regional Airport|Danville|US|S0
DNX|Galegu Airport|Dinder|SD|S0
DNZ|Çardak Airport|Denizli|TR|M1
DOA|Doany Airport|Doany|MG|S0
DOB|Rar Gwamar Airport|Dobo-Warmar Island|ID|S0
DOD|Dodoma Airport|Dodoma|TZ|M1
DOE|Djumu-Djomoe Airport|Djumu-Djomoe|SR|S0
DOG|Dongola Airport|Dongola|SD|M1
DOH|Hamad International Airport|Doha|QA|L1
DOI|Doini Airport|Castori Islets|PG|S0
DOL|Deauville Normandie airport|Deauville|FR|M1
DOM|Douglas-Charles Airport|Marigot|DM|M1
DON|Dos Lagunas Airport|Dos Lagunas|GT|S0
DOO|Dorobisoro Airport|Dorobisoro|PG|S0
DOP|Dolpa Airport|Dolpa|NP|S1
DOR|Dori Airport|Dori|BF|S0
DOU|Dourados Airport|Dourados|BR|S0
DOV|Dover Civil Air Terminal/Dover Air Force Base|Dover|US|M1
DOX|Dongara Airport|Port Denison|AU|S0
DOY|Dongying Shengli Airport|Dongying (Kenli)|CN|M1
DPA|Dupage Airport|Chicago/West Chicago|US|M0
DPB|Pampa Guanaco Airport|Bahia Inutil|CL|S0
DPE|Dieppe-Saint-Aubin Airport|Saint-Aubin-sur-Scie|FR|S0
DPG|Michael AAF (Dugway Proving Ground) Airport|Dugway Proving Ground|US|S0
DPL|Dipolog Airport|Dipolog|PH|M1
DPO|Devonport Airport|Devonport|AU|M1
DPS|Denpasar I Gusti Ngurah Rai International Airport|Kuta, Badung|ID|L1
DPT|Deputatskiy Airport|Deputatskiy|RU|S1
DQA|Daqing Sartu Airport|Daqing|CN|S1
DQM|Duqm International Airport|Duqm|OM|L1
DRA|Desert Rock Airport|Mercury|US|M0
DRB|Derby Airport|Derby|AU|M0
DRC|Dirico Airport|Dirico|AO|S0
DRD|Dorunda Airport|Dorunda Outstation|AU|S0
DRE|Drummond Island Airport|Drummond Island|US|S0
DRF|Drift River Airport|Kenai|US|S0
DRG|Deering Airport|Deering|US|M1
DRH|Dabra Airport|Dabra|ID|S0
DRI|Beauregard Regional Airport|DeRidder|US|M0
DRJ|Drietabbetje Airport|Drietabbetje|SR|S1
DRK|Drake Bay Airport|Puntarenas|CR|S0
DRN|Dirranbandi Airport||AU|M0
DRO|Durango La Plata County Airport|Durango|US|M1
DRP|Bicol International Airport|Legazpi|PH|L1
DRR|Durrie Airport||AU|S0
DRS|Dresden Airport|Dresden|DE|L1
DRT|Del Rio International Airport|Del Rio|US|M0
DRU|Drummond Airport|Drummond|US|S0
DRV|Dharavandhoo Airport|Baa Atoll|MV|S1
DRW|Darwin International Airport / RAAF Darwin|Darwin|AU|L1
DRY|Drysdale River Airport|Drysdale River|AU|S0
DSC|Dschang Airport|Dschang|CM|S0
DSD|La Désirade Airport|Grande Anse|GP|S1
DSE|Kombolcha Airport|Dessie|ET|S1
DSG|Dilasag Airport|Dilasag|PH|S0
DSI|Destin Executive Airport|Destin|US|M1
DSK|Dera Ismael Khan Airport [IN-ACTIVE]|Dera Ismael Khan|PK|M0
DSM|Des Moines International Airport|Des Moines|US|L1
DSN|Ordos Ejin Horo International Airport|Ordos|CN|L1
DSO|Sondok Airport|Sŏndŏng-ni|KP|M1
DSS|Blaise Diagne International Airport|Dakar|SN|L1
DSV|Dansville Municipal Airport|Dansville|US|S0
DSX|Dongsha Island (Pratas Island) Airport|Kaohsiung (Cijin - Pratas Island)|TW|S0
DSY|Dara Sakor International Airport|Ta Noun|KH|L1
DTA|Delta Municipal Airport|Delta|US|S0
DTB|Silangit Airport|Siborong-Borong|ID|S1
DTD|Datadawai Airport|Datadawai-Borneo Island|ID|S1
DTE|Daet Airport|Daet|PH|M0
DTH|Furnace Creek Airport|Death Valley|US|S0
DTI|Diamantina Airport|Diamantina|BR|S0
DTL|Detroit Lakes Airport|Detroit Lakes|US|S0
DTM|Dortmund Airport|Dortmund|DE|L1
DTN|Shreveport Downtown Airport|Shreveport|US|S0
DTR|Decatur Shores Airport|Decatur|US|S1
DTU|Wudalianchi Dedu Airport|Heihe|CN|M1
DTW|Detroit Metropolitan Wayne County Airport|Detroit|US|L1
DTX|McKinney National Airport|Dallas|US|S0
DUA|Durant Regional Airport - Eaker Field|Durant|US|M0
DUB|Dublin Airport|Dublin|IE|L1
DUC|Halliburton Field|Duncan|US|S0
DUD|Dunedin International Airport|Dunedin|NZ|M1
DUE|Dundo Airport|Chitato|AO|M1
DUF|Pine Island Airport|Corolla|US|S0
DUG|Bisbee Douglas International Airport|Douglas Bisbee|US|M0
DUJ|DuBois Regional Airport|Dubois|US|M1
DUK|Mubatuba Airport|Mubatuba|ZA|S0
DUM|Pinang Kampai Airport|Dumai|ID|M1
DUQ|Duncan Airport|Duncan|CA|S0
DUR|King Shaka International Airport|Durban|ZA|L1
DUS|Düsseldorf Airport|Düsseldorf|DE|L1
DUT|Tom Madsen (Dutch Harbor) Airport|Unalaska|US|M1
DVD|Andavadoaka Airport|Andavadoaka|MG|S0
DVK|Diavik Airport|Diavik|CA|S0
DVL|Devils Lake Regional Airport|Devils Lake|US|M1
DVN|Davenport Municipal Airport|Davenport|US|S0
DVO|Francisco Bangoy International Airport|Davao|PH|L1
DVP|Davenport Downs Airport||AU|S0
DVR|Daly River Airport|Nauiyu|AU|S0
DVT|Phoenix Deer Valley Airport|Phoenix|US|S0
DWA|Dwangwa Airport|Dwangwa|MW|M0
DWB|Soalala Airport|Soalala|MG|S1
DWC|Al Maktoum International Airport|Dubai(Jebel Ali)|AE|L1
DWD|Dawadmi Domestic Airport|Dawadmi|SA|M1
DWH|David Wayne Hooks Memorial Airport|Houston|US|S0
DWR|Dwyer Airport|Reg|AF|S0
DWS|Morin Dawa Banner Airport|Hulunbuir|CN|S0
DXB|Dubai International Airport|Dubai|AE|L1
DXD|Dixie Airport|New Dixie|AU|S0
DXE|Bruce Campbell Field|Madison|US|S0
DXJ|Xiangxi Biancheng Airport|Xiangxi|CN|S1
DXN|Noida International Airport|Gautam Buddha Nagar|IN|L1
DXR|Danbury Municipal Airport|Danbury|US|M0
DYA|Dysart Airport||AU|M0
DYG|Zhangjiajie Hehua International Airport|Zhangjiajie (Yongding)|CN|L1
DYL|Doylestown Airport|Doylestown|US|S0
DYM|Diamantina Lakes Airport|Diamantina Lakes|AU|S0
DYR|Ugolny Yuri Ryktheu Airport|Anadyr|RU|M1
DYS|Dyess Air Force Base|Abilene|US|M0
DYU|Dushanbe International Airport|Dushanbe|TJ|L1
DYW|Daly Waters Airport|Daly Waters|AU|S0
DZA|Dzaoudzi Pamandzi International Airport|Dzaoudzi|YT|L1
DZH|Dazhou Jinya Airport|Dazhou (Dachuan)|CN|M1
DZI|Las Flores Airport|Codazzi|CO|S0
DZN|Zhezkazgan National Airport|Zhezkazgan|KZ|L1
DZO|Santa Bernardina International Airport|Durazno|UY|M0
DZU|Dazu Air Base|Dazu|CN|S0
EAA|Eagle Airport|Eagle|US|S1
EAB|Abs Airport|Abs|YE|S0
EAE|Siwo Airport|Emae Island|VU|S0
EAL|Elenak Airport|Mejato Island|MH|S0
EAM|Najran Domestic Airport|Najran|SA|M1
EAN|Phifer Airfield|Wheatland|US|S0
EAR|Kearney Regional Airport|Kearney|US|M1
EAS|San Sebastián Airport|Hondarribia|ES|M1
EAT|Pangborn Memorial Airport|Wenatchee|US|M1
EAU|Chippewa Valley Regional Airport|Eau Claire|US|M1
EAX|Eduard Alexander Gummels Airport|Kwatta|SR|S1
EBA|Marina di Campo Airport|Campo nell'Elba (LI)|IT|M1
EBB|Entebbe International Airport|Entebbe|UG|L1
EBD|El-Obeid Airport|El-Obeid|SD|M1
EBG|El Bagre Airport|El Bagre|CO|M0
EBH|El Bayadh Airport|El Bayadh|DZ|S1
EBJ|Esbjerg Airport|Esbjerg|DK|M1
EBL|Erbil International Airport|Arbil|IQ|L1
EBM|El Borma Airport|El Borma|TN|M0
EBN|Ebadon Airport|Ebadon Island|MH|S0
EBO|Ebon Airport|Ebon Atoll|MH|S0
EBS|Webster City Municipal Airport|Webster City|US|S0
EBU|Saint-Étienne-Bouthéon Airport|Andrézieux-Bouthéon, Loire|FR|M0
EBW|Ebolowa Airport|Ebolowa|CM|S0
ECA|Iosco County Airport|East Tawas|US|S0
ECG|Elizabeth City Regional Airport & Coast Guard Air Station|Elizabeth City|US|M0
ECH|Echuca Airport||AU|M0
ECI|Costa Esmeralda Airport|Tola|NI|S0
ECN|Ercan International Airport|Tymbou (Kirklar)|CY|L1
ECO|El Encanto Airport|El Encanto|CO|S0
ECP|Northwest Florida Beaches International Airport|Panama City Beach|US|M1
ECR|El Charco Airport|El Charco|CO|S0
ECS|Mondell Field|Newcastle|US|S0
EDB|Al Dabbah Airport|Al Dabbah|SD|S0
EDD|Erldunda Airport|Ghan|AU|S0
EDE|Northeastern Regional Airport|Edenton|US|S0
EDF|Elmendorf Air Force Base|Anchorage|US|M0
EDI|Edinburgh Airport|Ingliston, Edinburgh|GB|L1
EDK|Captain Jack Thomas El Dorado Airport|El Dorado|US|S0
EDL|Eldoret International Airport|Eldoret|KE|L1
EDM|La Roche-sur-Yon Les Ajoncs Airport|La Roche-sur-Yon|FR|M0
EDN|Yedinka Airport|Yedinka|RU|S0
EDO|Balıkesir Koca Seyit Airport|Edremit|TR|L1
EDQ|Erandique Airport|Erandique|HN|S0
EDR|Pormpuraaw Airport|Pormpuraaw|AU|S1
EDW|Edwards Air Force Base|Edwards|US|M0
EEA|Planalto Serrano Regional Airport|Correia Pinto|BR|M0
EED|Needles Airport|Needles|US|M0
EEK|Eek Airport|Eek|US|S1
EEN|Dillant Hopkins Airport|Keene|US|M0
EES|Berenice International Airport / Banas Cape Air Base|Berenice Troglodytica|EG|M0
EFD|Ellington Airport|Houston|US|M0
EFG|Efogi Airport|Efogi|PG|S0
EFK|Northeast Kingdom International Airport|Newport|US|S0
EFL|Kefalonia International Airport "Anna Pollatou"|Kefallinia Island|GR|L1
EFW|Jefferson Municipal Airport|Jefferson|US|S0
EGA|Engati Airstrip|Engati|PG|S0
EGC|Bergerac Dordogne-Périgord airport|Bergerac|FR|M1
EGE|Eagle County Regional Airport|Eagle|US|M1
EGH|El Jora Airport|El Jora|EG|M0
EGI|Duke Field|Crestview|US|M0
EGL|Negele Airport|Negele Borana|ET|S0
EGM|Sege Airport|Sege|SB|S0
EGN|Geneina Airport|Geneina|SD|S0
EGO|Belgorod International Airport|Belgorod|RU|M0
EGP|Maverick County Memorial International Airport|Eagle Pass|US|S0
EGS|Egilsstaðir Airport|Egilsstaðir|IS|M1
EGV|Eagle River Union Airport|Eagle River|US|S0
EGX|Egegik Airport|Egegik|US|M1
EHL|El Bolsón Airfield|El Bolsón|AR|M0
EHM|Cape Newenham LRRS Airport|Cape Newenham|US|M0
EHU|Ezhou Huahu International Airport|Ezhou|CN|L1
EIB|Eisenach-Kindel Airport|Hörselberg-Hainich|DE|M0
EIE|Yeniseysk Airport|Yeniseysk|RU|M1
EIH|Einasleigh Airport|Einasleigh|AU|S0
EIK|Yeysk Airport|Yeysk|RU|M0
EIL|Eielson Air Force Base|Fairbanks|US|M0
EIN|Eindhoven Airport|Eindhoven|NL|L1
EIS|Terrance B. Lettsome International Airport|Beef Island|VG|L1
EIY|Ein Yahav Airfield|Sapir|IL|S0
EJA|Yariguíes Airport|Barrancabermeja|CO|M1
EJH|Al Wajh Domestic Airport|Al Wajh|SA|M1
EJN|Ejin Banner Taolai Airport|Ejin Banner|CN|S0
EJT|Enejit Airport|Enejit Island|MH|S1
EKA|Murray Field|Eureka|US|M0
EKB|Ekibastuz Airport|Ekibastuz|KZ|M0
EKD|Elkedra Airport||AU|S0
EKI|Elkhart Municipal Airport|Elkhart|US|S0
EKN|Elkins-Randolph County Regional Airport|Elkins|US|M0
EKO|Elko Regional Airport|Elko|US|M1
EKS|Shakhtyorsk Airport|Shakhtyorsk|RU|S1
EKT|Eskilstuna Airport|Eskilstuna|SE|M0
EKX|Addington Field / Elizabethtown Regional Airport|Elizabethtown|US|S0
ELA|Eagle Lake Airport|Eagle Lake|US|S0
ELB|Las Flores Airport|El Banco|CO|M0
ELC|Elcho Island Airport|Elcho Island|AU|M1
ELD|South Arkansas Regional Airport at Goodwin Field|El Dorado|US|M1
ELE|EL Real Airport|El Real de Santa María|PA|S0
ELF|El Fasher Airport|El Fasher|SD|M1
ELG|El Golea Airport|El Menia|DZ|M1
ELH|North Eleuthera Airport|North Eleuthera|BS|M1
ELI|Elim Airport|Elim|US|S1
ELJ|El Recreo Airport|Ruperto Polania|CO|S0
ELK|Elk City Regional Business Airport|Elk City|US|S0
ELL|Ellisras Matimba Airport|Ellisras|ZA|S0
ELM|Elmira Corning Regional Airport|Elmira/Corning|US|M1
ELN|Bowers Field|Ellensburg|US|S0
ELO|El Dorado Airport|El Dorado|AR|S0
ELP|El Paso International Airport|El Paso|US|L1
ELQ|Prince Naif bin Abdulaziz International Airport|Qassim|SA|L1
ELR|Elelim Airport|Elelim|ID|S0
ELS|King Phalo Airport|East London|ZA|L1
ELT|At Tur Airport|At Tur|EG|S0
ELU|Guemar Airport - مطار قمار بالوادي|Guemar|DZ|M1
ELX|El Tigre Airport|El Tigre|VE|S0
ELY|Ely Airport Yelland Field|Ely|US|M0
ELZ|Wellsville Municipal Airport - Tarantine Field|Wellsville|US|S0
EMA|East Midlands Airport|Nottingham, Leicestershire|GB|L1
EMD|Emerald Airport|Emerald|AU|M1
EME|Emden Airport|Emden|DE|S1
EMG|Empangeni Airport|Empangeni|ZA|S0
EMI|Emirau Airport|Emirau Island|PG|S0
EMK|Emmonak Airport|Emmonak|US|M1
EML|Emmen Air Base|Emmen|CH|M0
EMM|Kemmerer Municipal Airport|Kemmerer|US|S0
EMN|Néma Airport|Néma|MR|S0
EMO|Emo River Airstrip|Emo Mission|PG|S0
EMP|Emporia Municipal Airport|Emporia|US|S0
EMS|Embessa Airport|Embessa|PG|S0
EMT|San Gabriel Valley Airport|El Monte|US|S0
EMX|El Maitén Airport|El Maitén|AR|S0
EMY|El Minya Airport|El Minya|EG|S0
ENA|Kenai Municipal Airport|Kenai|US|M1
ENB|Eneabba Airport|Eneabba|AU|S0
ENC|Nancy-Essey Airport|Tomblaine, Meurthe-et-Moselle|FR|M0
END|Vance Air Force Base|Enid|US|M0
ENE|H. Hasan Aroeboesman (Ende) Airport|Ende|ID|S1
ENF|Enontekio Airport|Enontekio|FI|M1
ENG|Enggano Airport|Enggano|ID|S0
ENH|Enshi Xujiaping Airport|Enshi (Enshi)|CN|M1
ENI|El Nido Airport|El Nido|PH|S1
ENJ|El Naranjo Airport|El Naranjo|GT|S0
ENK|Enniskillen/St Angelo Airport|Enniskillen, Fermanagh and Omagh|GB|M0
ENL|Centralia Municipal Airport|Centralia|US|S0
ENN|Nenana Municipal Airport|Nenana|US|M0
ENO|Teniente Ramon A. Ayub Gonzalez International Airport|Encarnación|PY|L1
ENS|Twente Airport|Enschede|NL|M0
ENT|Eniwetok Airport|Eniwetok Atoll|MH|S1
ENU|Akanu Ibiam International Airport|Enegu|NG|L1
ENV|Wendover Airport|Wendover|US|M0
ENW|Kenosha Regional Airport|Kenosha|US|M0
ENY|Yan'an Nanniwan Airport|Yan'an (Baota)|CN|M1
EOH|Enrique Olaya Herrera Airport|Medellín|CO|M1
EOI|Eday Airport|Eday|GB|M1
EOK|Keokuk Municipal Airport|Keokuk|US|S0
EOR|El Dorado Airport|Bolivar|VE|M0
EOS|Neosho Hugh Robinson Airport|Neosho|US|S0
EOZ|Elorza Airport||VE|M0
EPA|El Palomar Airport|El Palomar|AR|M0
EPG|Browns Airport|Weeping Water|US|S0
EPH|Ephrata Municipal Airport|Ephrata|US|S0
EPL|Épinal Mirecourt Airport|Épinal|FR|M0
EPR|Esperance Airport|Esperance|AU|M1
EPT|Eliptamin Airport|Eliptamin|PG|S0
EPU|Pärnu Airport|Pärnu|EE|M1
EQS|Esquel Brigadier Antonio Parodi International Airport|Esquel|AR|M1
ERA|Erigavo Airport|Erigavo|SO|S0
ERB|Ernabella Airport||AU|S0
ERC|Erzincan Airport|Erzincan|TR|M1
ERD|Berdyansk Airport|Berdyansk|UA|M0
ERE|Erave Airport|Erave|PG|S0
ERF|Erfurt-Weimar Airport|Erfurt|DE|L1
ERG|Yerbogachen Airport|Erbogachen|RU|S0
ERH|Moulay Ali Cherif Airport|Errachidia|MA|M1
ERI|Erie International Tom Ridge Field|Erie|US|M1
ERL|Erenhot Saiwusu International Airport|Erenhot|CN|M1
ERM|Erechim Airport|Erechim|BR|S0
ERN|Eirunepé Airport|Eirunepé|BR|S0
ERQ|Elrose Airport|Elrose Mine|AU|S0
ERR|Errol Airport|Errol|US|S0
ERS|Eros Airport|Windhoek|NA|M1
ERT|Erdenet Airport|Erdenet|MN|S0
ERU|Erume Airport|Erume|PG|S0
ERV|Kerrville / Kerr County Airport at Louis Schreiner Field|Kerrville|US|S0
ERZ|Erzurum International Airport|Erzurum|TR|M1
ESA|Esa'ala Airport|Esa'ala|PG|S0
ESB|Esenboğa International Airport|Ankara|TR|L1
ESC|Delta County Airport|Escanaba|US|M1
ESD|Orcas Island Airport|Eastsound|US|M1
ESE|Ensenada International Airport / El Ciprés Air Base|Ensenada|MX|M0
ESF|Esler Army Airfield / Esler Regional Airport|Alexandria|US|M0
ESG|Dr. Luis María Argaña International Airport|Mariscal Estigarribia|PY|M0
ESH|Brighton City Airport|Brighton, East Sussex|GB|M0
ESK|Eskişehir Air Base|Eskişehir|TR|M0
ESL|Elista Airport|Elista|RU|M1
ESM|Carlos Concha Torres International Airport|Tachina|EC|L1
ESN|Easton Airport / Newnam Field|Easton|US|S0
ESO|Ohkay Owingeh Airport|Espanola|US|S0
ESR|Ricardo García Posada Airport|El Salvador|CL|M1
ESS|Essen-Mülheim Airport|Essen|DE|S0
EST|Estherville Municipal Airport|Estherville|US|S0
ESU|Essaouira-Mogador Airport|Essaouira|MA|M1
ESW|Easton State Airport|Easton|US|S0
ETB|West Bend Municipal Airport|West Bend|US|S0
ETD|Etadunna Airport|Etadunna|AU|S0
ETE|Metema Airport|Metema|ET|S0
ETL|Svetlaya Airport|Svetlaya|RU|S0
ETM|Ramon International Airport|Eilat|IL|L1
ETN|Eastland Municipal Airport|Eastland|US|S0
ETR|Santa Rosa - Artillery Colonel Victor Larrea International Airport|Santa Rosa|EC|M1
ETS|Enterprise Municipal Airport|Enterprise|US|S0
ETZ|Metz-Nancy-Lorraine Airport|Goin|FR|M1
EUA|Kaufana Airport|Eua Island|TO|S1
EUC|Eucla Airport||AU|S0
EUE|Eureka Airport|Eureka|US|S0
EUF|Weedon Field|Eufaula|US|S0
EUG|Eugene Airport|Eugene|US|M1
EUM|Neumünster Airport|Neumünster|DE|S0
EUN|Laayoune Hassan I International Airport|El Aaiún|EH|L1
EUO|Paratebueno Airport|Paratebueno|CO|S0
EUQ|Evelio Javier Airport|San Jose|PH|M0
EUX|F. D. Roosevelt Airport|Oranjestad|BQ|M1
EVD|Eva Downs Airport|Eva Downs|AU|S0
EVE|Harstad/Narvik Airport|Evenes|NO|L1
EVG|Sveg Airport|Sveg|SE|S1
EVH|Evans Head Aerodrome||AU|S0
EVM|Eveleth–Virginia Municipal Airport|Eveleth|US|S0
EVN|Zvartnots International Airport|Yerevan|AM|L1
EVV|Evansville Regional Airport|Evansville|US|M1
EVW|Evanston-Uinta County Airport-Burns Field|Evanston|US|M0
EVX|Évreux-Fauville (BA 105) Air Base|Fauville, Eure|FR|M0
EWB|New Bedford Regional Airport|New Bedford|US|M1
EWE|Ewer Asmat Airport|Agats|ID|S0
EWI|Enarotali Airport|Enarotali|ID|S0
EWK|Newton City-County Airport|Newton|US|S0
EWN|Coastal Carolina Regional Airport|New Bern|US|M1
EWO|Ewo Airport|Ewo|CG|S0
EWR|Newark Liberty International Airport|Newark|US|L1
EXM|Exmouth Airport|Exmouth|AU|S0
EXT|Exeter International Airport|Exeter, Devon|GB|M1
EYA|Zeya Airport|Zeya|RU|S0
EYK|Beloyarskiy Airport||RU|M1
EYL|Yélimané Airport|Yélimané|ML|S0
EYP|El Alcaravan - Yopal Airport|Yopal|CO|M1
EYR|Yerington Municipal Airport|Yerington|US|S0
EYS|Eliye Springs Airport|Eliye Springs|KE|S0
EYW|Key West International Airport|Key West|US|M1
EZE|Ezeiza International Airport - Ministro Pistarini|Buenos Aires (Ezeiza)|AR|L1
EZS|Elazığ Airport|Elazığ|TR|M1
EZV|Berezovo Airport||RU|M0
FAA|Faranah Airport|Faranah|GN|S0
FAB|Farnborough Airport|Farnborough, Hampshire|GB|M0
FAC|Faaite Airport|Faaite|PF|S0
FAE|Vágar Airport|Vágar|FO|L1
FAF|Felker Army Air Field|Newport News (Fort Eustis)|US|M0
FAG|Fagurhólsmýri Airport|Fagurhólsmýri|IS|S0
FAH|Farah Airport|Farah|AF|S0
FAI|Fairbanks International Airport|Fairbanks|US|M1
FAM|Farmington Regional Airport|Farmington|US|S0
FAO|Faro - Gago Coutinho International Airport|Faro|PT|L1
FAQ|Frieda River Airport|Frieda River|PG|S0
FAR|Hector International Airport|Fargo|US|M1
FAT|Fresno Yosemite International Airport|Fresno|US|L1
FAU|Fahud Airport|Fahud|OM|S0
FAV|Fakarava Airport||PF|M1
FAY|Fayetteville Regional Airport - Grannis Field|Fayetteville|US|M1
FAZ|Fasa Airport|Fasa|IR|M0
FBA|Fonte Boa Airport|Fonte Boa|BR|S0
FBD|Fayzabad Airport|Fayzabad|AF|S1
FBE|Paulo Abdala Airport|Francisco Beltrão|BR|S1
FBG|Simmons Army Air Field|Fort Bragg|US|M0
FBK|Ladd Army Airfield|Fairbanks|US|M0
FBL|Faribault Municipal Airport-Liz Wall Strohfus Field|Faribault|US|S0
FBM|Lubumbashi International Airport|Lubumbashi|CD|L1
FBR|Fort Bridger Airport|Fort Bridger|US|S0
FBY|Fairbury Municipal Airport|Fairbury|US|S0
FCA|Glacier Park International Airport|Kalispell|US|M1
FCB|Ficksburg Sentraoes Airport|Ficksburg|ZA|M0
FCH|Fresno Chandler Executive Airport|Fresno|US|S0
FCM|Flying Cloud Airport|Minneapolis|US|S0
FCN|Sea-Airport Cuxhaven/Nordholz / Nordholz Naval Airbase|Wurster Nordseeküste|DE|M1
FCO|Rome–Fiumicino Leonardo da Vinci International Airport|Rome|IT|L1
FCS|Butts AAF (Fort Carson) Air Field|Fort Carson|US|M0
FCY|Forrest City Municipal Airport|Forrest City|US|S0
FDA|Fundación Airport|Fundación|CO|S0
FDE|Førde Airport, Bringeland|Førde|NO|S1
FDF|Martinique Aimé Césaire International Airport|Fort-de-France|MQ|L1
FDH|Bodensee Airport Friedrichshafen|Friedrichshafen|DE|L1
FDK|Frederick Municipal Airport|Frederick|US|S0
FDR|Frederick Regional Airport|Frederick|US|S0
FDU|Bandundu Airport|Bandundu|CD|M1
FDY|Findlay Airport|Findlay|US|M0
FEB|Sanfebagar Airport|Sanfebagar|NP|S0
FEC|João Durval Carneiro Airport|Feira de Santana|BR|M0
FEG|Fergana International Airport|Fergana|UZ|M1
FEJ|Feijó Airport|Feijó|BR|S0
FEN|Fernando de Noronha Airport|Fernando de Noronha|BR|M1
FEP|Albertus Airport|Freeport|US|S0
FET|Fremont Municipal Airport|Fremont|US|S0
FEZ|Fes Saïss International Airport|Saïss|MA|L1
FFA|First Flight Airport|Kill Devil Hills|US|S0
FFD|RAF Fairford|Fairford, Gloucestershire|GB|M0
FFL|Fairfield Municipal Airport|Fairfield|US|S0
FFM|Fergus Falls Municipal Airport - Einar Mickelson Field|Fergus Falls|US|S0
FFO|Wright-Patterson Air Force Base|Dayton|US|M0
FFT|Capital City Airport|Frankfort|US|S0
FFU|Futaleufú Airport|Futaleufu|CL|S0
FGD|Fderik Airport|Fderik|MR|S0
FGI|Fagali'i Airport|Apia|WS|S0
FGU|Fangatau Airport|Fangatau|PF|M1
FHU|Sierra Vista Municipal Airport / Libby Army Air Field|Fort Huachuca / Sierra Vista|US|M0
FHZ|Fakahina Airport|Fakahina|PF|S1
FID|Elizabeth Field|Fishers Island|US|S0
FIE|Fair Isle Airport|Fair Isle|GB|S1
FIG|Fria Airport|Fria|GN|S0
FIH|Ndjili International Airport|Kinshasa|CD|L1
FIK|Finke Airport|Finke|AU|S0
FIL|Fillmore Municipal Airport|Fillmore|US|S0
FIN|Finschhafen Airport|Buki|PG|S0
FIZ|Fitzroy Crossing Airport||AU|M1
FJR|Fujairah International Airport|Fujairah|AE|L1
FKB|Karlsruhe Baden-Baden Airport|Rheinmünster|DE|L1
FKI|Bangoka International Airport|Kisangani|CD|L1
FKJ|Fukui Airport|Fukui|JP|M0
FKL|Venango Regional Airport|Franklin|US|M0
FKN|Franklin Regional Airport|Franklin|US|S0
FKQ|Fakfak Airport|Fakfak|ID|M1
FKS|Fukushima Airport|Sukagawa|JP|M1
FLA|Gustavo Artunduaga Paredes Airport|Florencia|CO|M1
FLB|Cangapara Airport|Floriano|BR|S0
FLD|Fond du Lac County Airport|Fond du Lac|US|S0
FLF|Flensburg-Schäferhaus Airport|Flensburg|DE|S0
FLG|Flagstaff Pulliam Airport|Flagstaff|US|M1
FLH|Flotta Isle Airstrip|Flotta Isle|GB|S0
FLL|Fort Lauderdale Hollywood International Airport|Fort Lauderdale|US|L1
FLM|Fernheim Airport|Filadelfia|PY|S0
FLN|Hercílio Luz International Airport|Florianópolis|BR|L1
FLO|Florence Regional Airport|Florence|US|M1
FLP|Marion County Regional Airport|Flippin|US|S0
FLR|Florence Airport, Peretola|Firenze (FI)|IT|L1
FLS|Flinders Island Airport|Whitemark|AU|S1
FLT|Flat Airport|Flat|US|S0
FLV|Sherman Army Air Field|Fort Leavenworth|US|S0
FLW|Flores Airport|Santa Cruz das Flores|PT|M1
FLX|Fallon Municipal Airport|Fallon|US|S0
FLY|Finley Airport||AU|S0
FLZ|Dr. Ferdinand Lumban Tobing Airport|Sibolga (Pinangsori)|ID|M1
FMA|Formosa National Airport|Formosa|AR|M1
FME|Fort Meade Executive Airport|Fort Meade(Odenton)|US|M0
FMG|Flamingo Airport|Brasilito|CR|S0
FMH|Cape Cod Coast Guard Air Station|Falmouth|US|S0
FMI|Kalemie Airport|Kalemie|CD|M1
FMM|Memmingen Allgau Airport|Memmingen|DE|L1
FMN|Four Corners Regional Airport|Farmington|US|M0
FMO|Münster Osnabrück Airport|Greven|DE|L1
FMS|Fort Madison Municipal Airport|Fort Madison|US|S0
FMT|Faresmaathoda Airport|Faresmaathodaa|MV|S1
FMU|Florence Municipal Airport|Florence|US|S0
FMY|Page Field|Fort Myers|US|M0
FNA|Lungi International Airport|Freetown (Lungi-Town)|SL|L1
FNB|Neubrandenburg Trollenhagen Airport|Trollenhagen|DE|M0
FNC|Cristiano Ronaldo International Airport|Funchal|PT|L1
FND|Funadhoo Airport|Funadhoo|MV|S1
FNE|Fane Airport|Fane Mission|PG|S0
FNG|Fada N'gourma Airport|Fada N'gourma|BF|S0
FNH|Fincha Airport|Fincha|ET|S0
FNI|Nîmes-Arles-Camargue Airport|Nîmes/Garons|FR|M1
FNJ|Pyongyang Sunan International Airport|Pyongyang|KP|L1
FNL|Northern Colorado Regional Airport|Loveland|US|M0
FNT|Bishop International Airport|Flint|US|M1
FNU|Oristano-Fenosu Airport|Oristano|IT|S0
FOA|Foula Airfield|Foula|GB|S1
FOB|Fort Bragg Airport|Fort Bragg|US|S0
FOC|Fuzhou Changle International Airport|Fuzhou (Changle)|CN|L1
FOD|Fort Dodge Regional Airport|Fort Dodge|US|M1
FOE|Topeka Regional Airport|Topeka|US|M0
FOG|Foggia Gino Lisa Airport|Foggia (FG)|IT|M1
FOK|Francis S Gabreski Airport|Westhampton Beach|US|S0
FOM|Foumban Nkounja Airport|Foumban|CM|M0
FON|La Fortuna Arenal Airport|La Fortuna|CR|M1
FOO|Kornasoren Airport|Nomfor|ID|S0
FOR|Pinto Martins International Airport|Fortaleza|BR|L1
FOS|Forrest Airport||AU|M0
FOT|Forster (Wallis Is) Airport||AU|S0
FOU|Fougamou Airport|Fougamou|GA|S0
FOY|Foya Airport|Foya|LR|S0
FPO|Grand Bahama International Airport|Freeport|BS|L1
FPR|Treasure Coast International Airport|Fort Pierce|US|M0
FPY|Perry-Foley Airport|Perry|US|S0
FRA|Frankfurt Main Airport|Frankfurt am Main|DE|L1
FRB|Forbes Airport|Forbes|AU|M0
FRC|Tenente Lund Pressoto Airport|Franca|BR|S0
FRD|Friday Harbor Airport|Friday Harbor|US|M1
FRE|Fera/Maringe Airport|Fera Island|SB|S1
FRG|Republic Airport|East Farmingdale|US|M0
FRH|French Lick Municipal Airport|French Lick|US|S0
FRI|Marshall Army Air Field|Fort Riley (Junction City)|US|M0
FRK|Frégate Island Airport (UNUSABLE)|Frégate Island|SC|S0
FRL|Forlì-Luigi Ridolfi International Airport|Forlì (FC)|IT|M1
FRM|Fairmont Municipal Airport|Fairmont|US|S0
FRN|Bryant Army Airfield|Fort Richardson|US|S0
FRO|Florø Airport|Florø|NO|M1
FRQ|Feramin Airport|Feramin|PG|S0
FRR|Front Royal Warren County Airport|Front Royal|US|S0
FRS|Mundo Maya International Airport|San Benito|GT|M1
FRT|El Avellano Airport|Frutillar|CL|S0
FRW|Phillip Gaonwe Matante International Airport|Francistown|BW|L1
FRY|Eastern Slopes Regional Airport|Fryeburg|US|S0
FRZ|Fritzlar Army Airfield|Fritzlar|DE|M0
FSC|Figari Sud-Corse Airport|Figari|FR|L1
FSD|Sioux Falls Regional Airport|Sioux Falls|US|M1
FSH|Syekh Hamzah Fansyuri Airport|Singkil|ID|S1
FSI|Henry Post Army Air Field|Fort Sill|US|M0
FSK|Fort Scott Municipal Airport|Fort Scott|US|S0
FSL|Fossil Downs Airport|Fossil Downs Station|AU|S0
FSM|Fort Smith Regional Airport|Fort Smith|US|M1
FSP|Saint-Pierre Pointe-Blanche Airport|Saint-Pierre|PM|M1
FST|Fort Stockton Pecos County Airport|Fort Stockton|US|M0
FSU|Fort Sumner Municipal Airport|Fort Sumner|US|S0
FSZ|Mount Fuji Shizuoka Airport|Makinohara / Shimada|JP|L1
FTA|Futuna Airport|Futuna Island|VU|S1
FTE|El Calafate - Commander Armando Tola International Airport|El Calafate|AR|M1
FTI|Fitiuta Airport|Fitiuta Village|AS|S1
FTK|Godman Army Air Field|Fort Knox|US|M0
FTU|Tôlanaro Airport|Tôlanaro|MG|M1
FTW|Fort Worth Meacham International Airport|Fort Worth|US|M1
FTX|Owando Airport|Owando|CG|M0
FTY|Fulton County Airport Brown Field|Atlanta|US|M0
FUB|Fulleborn Airport|Fulleborn|PG|S0
FUE|Fuerteventura Airport|El Matorral|ES|L1
FUG|Fuyang Xiguan Airport|Yingzhou, Fuyang|CN|M1
FUJ|Fukue Airport|Goto|JP|M1
FUK|Fukuoka Airport|Fukuoka|JP|L1
FUL|Fullerton Municipal Airport|Fullerton|US|S0
FUM|Fuma Airport|Fuma|PG|S0
FUN|Funafuti International Airport|Funafuti|TV|M1
FUO|Foshan Shadi Airport|Foshan (Nanhai)|CN|M1
FUT|Pointe Vele Airport|Futuna Island|WF|S1
FVL|Flora Valley Airport||AU|S0
FVM|Fuvahmulah Airport|Fuvahmulah Island|MV|S0
FVR|Oombulgurri Airport|Oombulgurri|AU|S0
FWA|Fort Wayne International Airport|Fort Wayne|US|M1
FWH|NAS Fort Worth JRB / Carswell Field|Fort Worth|US|M0
FWL|Farewell Airport|Farewell|US|S0
FXE|Fort Lauderdale Executive Airport|Fort Lauderdale|US|M0
FXO|Cuamba Airport|Cuamba|MZ|S0
FXY|Forest City Municipal Airport|Forest City|US|S0
FYJ|Fuyuan Dongji Airport|Fuyuan|CN|M1
FYM|Fayetteville Municipal Airport|Fayetteville|US|S0
FYN|Fuyun Koktokay Airport|Fuyun|CN|M1
FYT|Faya-Largeau Airport|Faya-Largeau|TD|M0
FYU|Fort Yukon Airport|Fort Yukon|US|M1
FYV|Drake Field|Fayetteville|US|M0
FZL|Fuzuli International Airport|Fuzuli|AZ|S0
GAA|Guamal Airport|Guamal|CO|S0
GAB|Gabbs Airport|Gabbs|US|S0
GAC|Celaque Gracias Airport|Gracias|HN|S0
GAD|Northeast Alabama Regional Airport|Gadsden|US|S0
GAE|Gabès Matmata International Airport|Gabès|TN|M0
GAF|Gafsa Ksar International Airport|Gafsa|TN|M0
GAG|Gage Heibeck Airport|Gage|US|S0
GAH|Gayndah Airport|Gayndah|AU|S0
GAI|Montgomery County Airpark|Gaithersburg|US|S0
GAJ|Yamagata Airport|Higashine|JP|M1
GAL|Edward G. Pitka Sr Airport|Galena|US|M1
GAM|Gambell Airport|Gambell|US|M1
GAN|Gan International Airport|Gan|MV|L1
GAO|Mariana Grajales Airport|Guantánamo|CU|M0
GAP|Gusap Airport|Gusap|PG|S0
GAQ|Gao International Airport|Gao|ML|M1
GAR|Garaina Airport|Garaina|PG|S0
GAS|Garissa Airport|Garissa|KE|S0
GAT|Gap-Tallard Airfield|Tallard, Hautes-Alpes|FR|S0
GAU|Lokpriya Gopinath Bordoloi International Airport|Guwahati|IN|L1
GAV|Gag Island Airport|Gag Island|ID|S0
GAW|Gangaw Airport|Gangaw|MM|S0
GAX|Gamba Airport|Gamba|GA|S1
GAY|Gaya Airport|Gaya|IN|M1
GAZ|Guasopa Airport|Woodlark (Muyua) Island|PG|S0
GBA|Cotswold Airport|Cirencester, Gloucestershire|GB|S0
GBB|Gabala International Airport|Gabala|AZ|M1
GBC|Gasuke Airport|Gasuke|PG|S0
GBD|Great Bend Municipal Airport|Great Bend|US|S0
GBE|Sir Seretse Khama International Airport|Gaborone|BW|L1
GBF|Negarbo(Negabo) Airport|Negarbo|PG|S0
GBG|Galesburg Regional HW Timmons  Airport|Galesburg|US|S0
GBH|Galbraith Lake Airport|Galbraith Lake|US|S0
GBI|Kalaburagi Airport|Kalaburagi|IN|S1
GBJ|Marie-Galante Airport|Grand-Bourg|GP|M1
GBK|Gbangbatok Airport|Gbangbatok|SL|S0
GBL|South Goulburn Is Airport||AU|S0
GBM|Garbaharey Airport|Garbaharey|SO|S0
GBP|Gamboola Airport|Gamboola|AU|S0
GBR|Walter J. Koladza Airport|Great Barrington|US|S0
GBT|Gorgan Airport|Gorgan|IR|M0
GBU|Khashm El Girba Airport|Khashm El Girba|SD|S0
GBV|Gibb River Airport|Gibb|AU|S0
GBW|Ginbata Airport|Ginbata|AU|S0
GBZ|Great Barrier Aerodrome|Claris|NZ|S1
GCA|Guacamayas Airport|Guacamayas|CO|S0
GCC|Northeast Wyoming Regional Airport|Gillette|US|M1
GCD|Grand Coulee Dam Airport|Electric City|US|S0
GCH|Gachsaran Airport|Gachsaran|IR|M1
GCI|Guernsey Airport|Saint Peter Port|GG|M1
GCJ|Grand Central Airport|Midrand|ZA|M0
GCK|Garden City Regional Airport|Garden City|US|M1
GCM|Owen Roberts International Airport|George Town|KY|L1
GCN|Grand Canyon National Park Airport|Grand Canyon - Tusayan|US|M1
GCT|Grand Canyon Bar Ten Airstrip|Littlefield|US|S0
GCV|Gravatai Airport|Gravatai|BR|S0
GCW|Grand Canyon West Airport|Peach Springs|US|S0
GCY|Greeneville Municipal Airport|Greeneville|US|S0
GDB|Gondia Airport|Gondia|IN|M1
GDC|Donaldson Field Airport|Greenville|US|S0
GDD|Gordon Downs Airport|Gordon Downs|AU|S0
GDE|Gode Airport|Gode|ET|M1
GDI|Gordil Airport|Melle|CF|S0
GDL|Guadalajara International Airport|Guadalajara|MX|L1
GDM|Gardner Municipal Airport|Gardner|US|S0
GDN|Gdańsk Lech Wałęsa Airport|Gdańsk|PL|L1
GDO|Guasdualito Airport|Guasdualito|VE|M0
GDP|Guadalupe Airport|Guadalupe|BR|S0
GDQ|Gondar Airport|Azezo|ET|M1
GDR|Angra dos Reis Airport|Angra dos Reis|BR|S0
GDT|JAGS McCartney International Airport|Cockburn Town|TC|M1
GDV|Dawson Community Airport|Glendive|US|M1
GDW|Gladwin Zettel Memorial Airport|Gladwin|US|S0
GDX|Sokol Airport|Magadan|RU|M1
GDZ|Gelendzhik Airport|Gelendzhik|RU|M1
GEA|Nouméa Magenta Airport|Nouméa|NC|M1
GEB|Gebe Airport|Gebe Island|ID|S0
GEC|Geçitkale Airbase|Lefkoniko (Geçitkale)|CY|M0
GED|Delaware Coastal Airport|Georgetown|US|S0
GEE|George Town Airport|George Town|AU|S0
GEF|Geva Airport|Liangia|SB|S0
GEG|Spokane International Airport|Spokane|US|L1
GEL|Santo Ângelo Airport|Santo Ângelo|BR|M1
GEM|President Obiang Nguema International Airport|Mengomeyén|GQ|M1
GEO|Cheddi Jagan International Airport|Georgetown|GY|L1
GER|Rafael Cabrera Airport|Nueva Gerona|CU|M1
GES|General Santos International Airport|General Santos|PH|L1
GET|Geraldton Airport|Moonyoonooka|AU|M1
GEV|Gällivare Airport|Gällivare|SE|M1
GEW|Gewoia Airport|Gewoia|PG|S0
GEY|South Big Horn County Airport|Greybull|US|S0
GFD|Pope Field|Greenfield|US|S0
GFE|Grenfell Airport|Grenfell|AU|S0
GFF|Griffith Airport|Griffith|AU|M1
GFK|Grand Forks International Airport|Grand Forks|US|M1
GFL|Floyd Bennett Memorial Airport|Glens Falls|US|M0
GFN|Clarence Valley Regional Airport|Grafton|AU|M0
GFO|Bartica A Airport|Bartica|GY|S0
GFR|Granville Airport|Bréville-sur-Mer, Manche|FR|M0
GFY|Grootfontein Airport|Grootfontein|NA|M0
GGB|Frederico Carlos Müller Airport|Água Boa|BR|S0
GGC|Lumbala Airport|Lumbala N'guimbo|AO|S0
GGD|Gregory Downs Airport||AU|S0
GGE|Georgetown County Airport|Georgetown|US|S0
GGF|Almeirim Airport|Almeirim|BR|S1
GGG|East Texas Regional Airport|Longview|US|M1
GGH|Engenheiro Gastão de Mesquita Filho Airport|Cianorte|BR|S0
GGJ|Guaíra Airport|Guaíra|BR|S1
GGM|Kakamega Airport|Kakamega|KE|S0
GGN|Gagnoa Airport|Gagnoa|CI|S0
GGO|Guiglo Airport|Guiglo|CI|S0
GGR|Garowe Airport|Garowe|SO|S1
GGS|Gobernador Gregores Airport|Gobernador Gregores|AR|S1
GGT|Exuma International Airport|Moss Town|BS|M1
GGW|Glasgow Valley County Airport Wokal Field|Glasgow|US|M1
GHA|Noumérat - Moufdi Zakaria Airport|El Atteuf|DZ|M1
GHB|Governor's Harbour Airport|Governor's Harbour|BS|M1
GHC|Great Harbour Cay Airport|Bullocks Harbour|BS|M0
GHE|Garachiné Airport|Garachiné|PA|S0
GHF|Giebelstadt Airport|Giebelstadt|DE|S0
GHK|Gahcho Kue|Kennedy Lake|CA|S0
GHM|Centerville Municipal Airport|Centerville|US|S0
GHN|Guanghan Airport|Deyang (Guanghan)|CN|M0
GHS|Melalan Airport|Melak-Borneo Island|ID|S0
GHT|Ghat Airport|Ghat|LY|M0
GHU|Gualeguaychu Airport|Gualeguaychu|AR|M0
GHV|Brașov-Ghimbav International Airport|Brașov (Ghimbav)|RO|L1
GIB|Gibraltar Airport|Gibraltar|GI|L1
GIC|Boigu Island Airport|Boigu Island|AU|S1
GID|Gitega Airport|Gitega|BI|M1
GIF|Winter Haven Regional Airport - Gilbert Field|Winter Haven|US|S0
GIG|Rio de Janeiro Galeão – Tom Jobim International Airport|Rio De Janeiro|BR|L1
GII|Siguiri Airport|Siguiri|GN|S0
GIL|Gilgit Airport|Gilgit|PK|M1
GIM|Miele Mimbale Airport|Miele Mimbale|GA|S0
GIR|Santiago Vila Airport|Girardot|CO|M0
GIS|Gisborne Airport|Gisborne|NZ|M1
GIT|Mchauru Airport|Geita|TZ|S0
GIU|Sigiriya Air Force Base|Sigiriya|LK|S0
GIY|Giyani Airport|Giyani|ZA|S0
GIZ|Jizan Regional Airport / King Abdullah bin Abdulaziz Airport|Jizan|SA|M1
GJA|La Laguna Airport|Guanaja|HN|M1
GJL|Jijel Ferhat Abbas Airport|Tahir|DZ|L1
GJM|Guajará-Mirim Airport|Guajará-Mirim|BR|M0
GJR|Gjögur Airport|Gjögur|IS|S0
GJT|Grand Junction Regional Airport|Grand Junction|US|M1
GKA|Goroka Airport|Goronka|PG|M1
GKD|Gökçeada Airport|Gökçeada|TR|S0
GKE|Geilenkirchen Air Base|Geilenkirchen|DE|M0
GKH|Palungtar Airport|Gorkha|NP|S0
GKK|Kooddoo Airport|Huvadhu Atoll|MV|S1
GKL|Great Keppel Is Airport|Great Keppel Island|AU|S0
GKN|Gulkana Airport|Gulkana|US|M1
GKT|Gatlinburg-Pigeon Forge Airport|Sevierville|US|S0
GLA|Glasgow Airport|Glasgow|GB|L1
GLB|San Carlos Apache Airport|Globe|US|S0
GLC|Geladi Airport|Geladi|ET|S0
GLD|Goodland Municipal Airport|Goodland|US|M0
GLE|Gainesville Municipal Airport|Gainesville|US|S0
GLF|Golfito Airport|Golfito|CR|M1
GLG|Glengyle Airport||AU|S0
GLH|Mid Delta Regional Airport|Greenville|US|M1
GLI|Glen Innes Airport|Glen Innes|AU|M0
GLK|Galcaio Airport|Galcaio|SO|S1
GLL|Gol Airport|Klanten flyplass|NO|S0
GLM|Glenormiston Airport||AU|S0
GLN|Guelmim Airport|Guelmim|MA|S0
GLO|Gloucestershire Airport|Staverton, Gloucestershire|GB|M0
GLP|Gulgubip Airport|Gulgubip|PG|S0
GLR|Gaylord Regional Airport|Gaylord|US|S0
GLS|Scholes International At Galveston Airport|Galveston|US|M0
GLT|Gladstone Airport|Gladstone|AU|M1
GLU|Gelephu Airport|Gelephu|BT|M0
GLV|Golovin Airport|Golovin|US|S1
GLW|Glasgow Municipal Airport|Glasgow|US|S0
GLX|Gamarmalamo Airport|Galela|ID|S0
GLZ|Gilze Rijen Air Base|Rijen|NL|M0
GMA|Gemena Airport|Gemena|CD|M1
GMB|Gambela Airport|Gambela|ET|M1
GMC|Guerima Airport|Puerto Carreño|CO|S0
GMD|Ben Slimane Airport|Ben Slimane|MA|S0
GME|Gomel Airport|Gomel|BY|M1
GMI|Gasmata Island Airport|Gasmata Island|PG|S1
GMM|Gamboma Airport|Gamboma|CG|S0
GMN|Greymouth Airport||NZ|S0
GMO|Gombe Lawanti International Airport|Gombe|NG|M1
GMP|Seoul Gimpo International Airport|Seoul|KR|L1
GMQ|Golog Maqên Airport|Golog (Maqên)|CN|M1
GMR|Totegegie Airport||PF|M1
GMS|Antônio Guerreiro Airport|Guimarães|BR|S0
GMT|Granite Mountain Air Station|Granite Mountain|US|S0
GMU|Greenville Downtown Airport|Greenville|US|M0
GMV|Monument Valley Airport|Oljato-Monument Valley|US|S0
GMZ|La Gomera Airport|Alajero, La Gomera Island|ES|S1
GNA|Hrodna Airport|Hrodna|BY|M0
GNB|Grenoble Alpes Isère Airport|Grenoble|FR|M1
GND|Maurice Bishop International Airport|Saint George's|GD|L1
GNF|Gansner Field|Quincy|US|S0
GNG|Gooding Municipal Airport|Gooding|US|S0
GNI|Lüdao Airport|Lüdao|TW|S0
GNJ|Ganja International Airport|Ganja|AZ|L1
GNM|Guanambi Airport|Guanambi|BR|S0
GNN|Ghinnir Airport|Ghinnir|ET|S0
GNR|Dr. Arturo H. Illia Airport|General Roca|AR|S0
GNS|Binaka Airport|Gunungsitoli|ID|M1
GNT|Grants-Milan Municipal Airport|Grants|US|S0
GNU|Goodnews Airport|Goodnews|US|S1
GNV|Gainesville Regional Airport|Gainesville|US|M1
GNY|Şanlıurfa GAP Airport|Şanlıurfa|TR|L1
GNZ|Ghanzi Airport|Ghanzi|BW|S0
GOA|Genoa Cristoforo Colombo Airport|Genova (GE)|IT|L1
GOB|Robe Airport|Goba|ET|S0
GOC|Gora Airstrip|Gora|PG|S0
GOE|Gonaili Airport|Gonaili|PG|S0
GOG|Gobabis Airport|Gobabis|NA|S0
GOH|Nuuk International Airport|Nuuk|GL|L1
GOI|Goa Dabolim International Airport|Vasco da Gama|IN|L1
GOJ|Nizhny Novgorod / Strigino International Airport|Nizhny Novgorod|RU|L1
GOK|Guthrie-Edmond Regional Airport|Guthrie|US|S0
GOL|Gold Beach Municipal Airport|Gold Beach|US|S0
GOM|Goma International Airport|Goma|CD|L1
GON|Groton New London Airport|Groton|US|M0
GOO|Goondiwindi Airport||AU|S0
GOP|Gorakhpur Airport|Gorakhpur|IN|M1
GOQ|Golmud Airport|Golmud|CN|M1
GOR|Gore Airport|Gore|ET|S0
GOS|Somersby Airstrip|Gosford|AU|S0
GOT|Göteborg Landvetter Airport|Göteborg|SE|L1
GOU|Garoua International Airport|Garoua|CM|L1
GOV|Gove Airport|Nhulunbuy|AU|M1
GOX|Manohar International Airport|Mopa|IN|L1
GOY|Tura Mountain Airport|Tura|RU|S1
GOZ|Gorna Oryahovitsa Airport|Gorna Oryahovitsa|BG|M0
GPA|Patras Araxos Agamemnon Airport|Patras|GR|M1
GPB|Tancredo Thomas de Faria Airport|Guarapuava|BR|S0
GPD|Mount Gordon Airport|Mount Gordon Mine|AU|S0
GPI|Guapi Airport|Guapi|CO|M1
GPL|Guapiles Airport|Pococi|CR|M0
GPN|Garden Point Airport|Pirlangimpi|AU|M0
GPO|General Pico Airport|General Pico|AR|M0
GPS|Seymour Galapagos Ecological Airport|Isla Baltra|EC|M1
GPT|Gulfport Biloxi International Airport|Gulfport|US|M1
GPZ|Grand Rapids Itasca Co-Gordon Newstrom field|Grand Rapids|US|S0
GQQ|Galion Municipal Airport|Galion|US|S0
GRA|Gamarra Airport|Puerto Mosquito|CO|S0
GRB|Austin Straubel International Airport|Green Bay|US|M1
GRC|Grand Cess Airport|Grand Cess|LR|S0
GRD|Greenwood County Airport|Greenwood|US|S0
GRE|Greenville Airport|Greenville|US|S0
GRF|Gray Army Air Field|Joint Base Lewis McChord|US|M0
GRG|Gardez Airport|Gardez|AF|S0
GRI|Central Nebraska Regional Airport|Grand Island|US|M1
GRJ|George Airport|George|ZA|L1
GRK|Killeen Regional Airport / Robert Gray Army Airfield|Fort Cavazos|US|M1
GRL|Garasa Airport|Au|PG|S0
GRM|Grand Marais Cook County Airport|Grand Marais|US|S0
GRN|Gordon Municipal Airport|Gordon|US|S0
GRO|Girona-Costa Brava Airport|Girona|ES|L1
GRP|Gurupi Airport|Gurupi|BR|S0
GRQ|Groningen Airport Eelde|Groningen|NL|L1
GRR|Gerald R. Ford International Airport|Grand Rapids|US|L1
GRS|Grosseto Corrado Baccarini Air Base / Grosseto Airport|Grosseto (GR)|IT|M0
GRT|Gujrat Airport|Gujrat|PK|S0
GRU|São Paulo/Guarulhos–Governor André Franco Montoro International Airport|São Paulo|BR|L1
GRV|Akhmat Kadyrov Grozny International Airport|Grozny|RU|L1
GRW|Graciosa Airport|Santa Cruz da Graciosa|PT|M1
GRX|F.G.L. Airport Granada-Jaén Airport|Granada|ES|M1
GRY|Grímsey Airport|Grímsey/Sandvík|IS|M1
GRZ|Graz Airport|Feldkirchen bei Graz|AT|L1
GSA|Long Pasia Airport|Long Miau|MY|S0
GSB|Seymour Johnson Air Force Base|Goldsboro|US|M0
GSC|Gascoyne Junction Airport|Gascoyne Junction|AU|S0
GSE|Säve Airport|Göteborg|SE|M0
GSH|Goshen Municipal Airport|Goshen|US|S0
GSI|Grand-Santi Airport|Grand-Santi|GF|S0
GSJ|San José Airport|Puerto San José|GT|M0
GSL|Taltheilei Narrows Airport|Taltheilei Narrows|CA|S0
GSM|Qeshm International Airport|Qeshm(Dayrestan)|IR|L1
GSN|Mount Gunson Airport|Mount Gunson|AU|S0
GSO|Piedmont Triad International Airport|Greensboro|US|L1
GSP|Greenville-Spartanburg International Airport|Greenville/Greer/Spartanburg|US|M1
GSQ|El Owainat East International Airport|Sharq El Owainat|EG|S0
GSR|Gardo Airport|Gardo|SO|S0
GSS|Sabi Sabi Airport|Belfast|ZA|S0
GST|Gustavus Airport|Gustavus|US|M1
GSV|Gagarin International Airport|Saratov|RU|L1
GTA|Gatokae Aerodrome|Gatokae|SB|S1
GTC|Chato/Geita Airport|Chato District|TZ|S0
GTE|Groote Eylandt Airport|Groote Eylandt|AU|M1
GTF|Great Falls International Airport|Great Falls|US|M1
GTG|Grantsburg Municipal Airport|Grantsburg|US|S0
GTI|Rügen Airport|Dreschvitz|DE|S0
GTK|Sungai Tekai Airport|Sungai Tekai|MY|S0
GTN|Glentanner Airport|Glentanner Station|NZ|M0
GTO|Jalaluddin Airport|Gorontalo|ID|S1
GTP|Grants Pass Airport|Grants Pass|US|S0
GTR|Golden Triangle Regional Airport|Columbus/W Point/Starkville|US|M1
GTS|The Granites Airport|The Granites Gold Mine|AU|S0
GTT|Georgetown Airport|Georgetown|AU|S0
GTY|Gettysburg Regional Airport|Gettysburg|US|S0
GTZ|Kirawira B Aerodrome|Grumeti Game Reserve|TZ|S0
GUA|La Aurora International Airport|Guatemala City|GT|L1
GUB|Guerrero Negro Airport|San Quintín|MX|S1
GUC|Gunnison Crested Butte Regional Airport|Gunnison|US|M1
GUD|Goundam Airport|Goundam|ML|S0
GUE|Guriaso (Keraso) Airport|Guriaso|PG|S0
GUF|Jack Edwards National Airport|Gulf Shores|US|S0
GUG|Guari Airport|Guari|PG|S0
GUH|Gunnedah Airport||AU|M0
GUI|Guiria Airport||VE|M0
GUJ|Edu Chaves Field|Guaratinguetá|BR|M0
GUL|Goulburn Airport||AU|M0
GUM|Antonio B. Won Pat International Airport|Hagåtña|GU|L1
GUO|Guriel Airport|Guriel|SO|S0
GUP|Gallup Municipal Airport|Gallup|US|M1
GUQ|Guanare Airport|Guanare|VE|M0
GUR|Gurney Airport|Gurney|PG|M1
GUS|Grissom Air Reserve Base|Peru|US|M0
GUU|Grundarfjörður Airport|Grundarfjörður|IS|S0
GUV|Mougulu Airport|Mougulu|PG|S0
GUW|Atyrau International Airport|Atyrau|KZ|L1
GUX|Guna Airport||IN|S0
GUY|Guymon Municipal Airport|Guymon|US|M0
GUZ|Guarapari Airport|Guarapari|BR|S1
GVA|Geneva International Airport|Geneva|CH|L1
GVE|Gordonsville Municipal Airport|Gordonsville|US|S0
GVI|Green River Airport|Green River|PG|S0
GVL|Lee Gilmer Memorial Airport|Gainesville|US|S0
GVN|Sovetskaya Gavan (Maygatka) Airport|Sovetskaya Gavan|RU|M0
GVP|Greenvale Airport||AU|S0
GVR|Coronel Altino Machado Airport|Governador Valadares|BR|M1
GVT|Majors Airport|Greenville|US|S0
GVX|Gävle–Sandviken Airport|Sandviken|SE|M0
GWA|Gwa Airport|Gwa|MM|S0
GWD|New Gwadar International Airport|Gurandani|PK|L1
GWE|Josiah Tungamirai Air Force Base|Gweru|ZW|M0
GWL|Gwalior Airport|Gwalior|IN|M1
GWO|Greenwood–Leflore Airport|Greenwood|US|M0
GWS|Sumers Airpark|Glenwood Springs|US|S0
GWT|Westerland Sylt Airport|Sylt|DE|M1
GWV|Glendale Fokker Field|Glendale|US|S0
GXF|Seiyun Hadhramaut International Airport|Seiyun|YE|L1
GXG|Negage Airport|Negage|AO|M1
GXH|Gannan Xiahe Airport|Gannan (Xiahe)|CN|M1
GXM|Kuala Kurun Airport|Kuala Kurun|ID|S0
GXQ|Teniente Vidal Airport|Coyhaique|CL|M0
GXX|Yagoua Airport|Yagoua|CM|S0
GXY|Greeley–Weld County Airport|Greeley|US|S0
GYA|Guayaramerín Airport|Guayaramerín|BO|M1
GYB|Port Hedland/Wodgina Airport|Wodgina|AU|S0
GYD|Heydar Aliyev International Airport|Baku|AZ|L1
GYE|José Joaquín de Olmedo International Airport|Guayaquil|EC|L1
GYG|Magan Airport|Magan|RU|M0
GYI|Gisenyi Airport|Gisenyi|RW|M0
GYL|Argyle Airport||AU|S0
GYM|General José María Yáñez International Airport|Guaymas|MX|M1
GYN|Santa Genoveva International Airport|Goiânia|BR|L1
GYO|Blangkejeren Airport|Kabupaten Gayo Lues|ID|S0
GYP|Gympie Airport||AU|S0
GYR|Phoenix Goodyear Airport|Goodyear|US|S0
GYS|Guangyuan Panlong Airport|Guangyuan (Lizhou)|CN|M1
GYU|Guyuan Liupanshan Airport|Guyuan (Yuanzhou)|CN|M1
GYY|Gary/Chicago International Airport|Gary|US|M1
GYZ|Gruyere Airport|Cosmo Newbery|AU|S1
GZG|Garze Gesar Airport|Garzê (Garzê)|CN|S1
GZI|Ghazni Airport|Ghazni|AF|S0
GZO|Nusatupe Airport|Gizo|SB|S1
GZP|Gazipaşa-Alanya Airport|Gazipaşa|TR|M1
GZT|Gaziantep Oğuzeli International Airport|Gaziantep|TR|L1
GZW|Qazvin Airport|Qazvin|IR|M0
HAA|Hasvik Airport|Hasvik|NO|S1
HAB|Marion County Rankin Fite Airport|Hamilton|US|S0
HAC|Hachijojima Airport|Hachijojima|JP|M1
HAD|Halmstad Airport|Halmstad|SE|M1
HAF|Half Moon Bay Airport|Half Moon Bay|US|S0
HAH|Prince Said Ibrahim International Airport|Moroni|KM|M1
HAI|Three Rivers Municipal Dr Haines Airport|Three Rivers|US|S0
HAJ|Hannover Airport|Hannover|DE|L1
HAK|Haikou Meilan International Airport|Haikou (Meilan)|CN|L1
HAL|Halali Airport|Halali|NA|S1
HAM|Hamburg Helmut Schmidt Airport|Hamburg|DE|L1
HAN|Noi Bai International Airport|Hanoi (Soc Son)|VN|L1
HAO|Butler Co Regional Airport - Hogan Field|Hamilton|US|S0
HAQ|Hanimaadhoo International Airport|Haa Dhaalu Atoll|MV|L1
HAR|Capital City Airport|Harrisburg|US|S0
HAS|Hail International Airport|Hail|SA|L1
HAT|Heathlands Airport|Shelburne|AU|S0
HAU|Haugesund Airport, Karmøy|Karmøy|NO|M1
HAV|José Martí International Airport|Havana|CU|L1
HAW|Haverfordwest Airport|Haverfordwest|GB|M0
HAY|Hacaritama Airport|Aguachica|CO|S0
HAZ|Hatzfeldhaven Airport|Hatzfeldhaven|PG|S0
HBA|Hobart International Airport|Hobart (Cambridge)|AU|L1
HBB|Industrial Airpark|Hobbs|US|S0
HBD|Habi Airport|Habi|PG|S0
HBE|Alexandria International Airport|Alexandria|EG|L1
HBG|Hattiesburg Bobby L Chain Municipal Airport|Hattiesburg|US|M0
HBK|Holbrook Municipal Airport|Holbrook|US|S0
HBQ|Haibei Qilian Airport|Haibei (Qilian)|CN|S1
HBR|Hobart Regional Airport|Hobart|US|M0
HBU|Bulgan Sum Airport|Bulgan|MN|S0
HBX|Hubballi Airport|Hubballi|IN|M1
HCA|Big Spring Mc Mahon-Wrinkle Airport|Big Spring|US|S0
HCC|Columbia County Airport|Hudson|US|S0
HCJ|Hechi Jinchengjiang Airport|Hechi (Jinchengjiang)|CN|M1
HCM|Eil Airport|Eyl|SO|S0
HCN|Hengchun Airport|Hengchun|TW|M0
HCQ|Halls Creek Airport||AU|M0
HCR|Holy Cross Airport|Holy Cross|US|M1
HCW|Cheraw Municipal Airport/Lynch Bellinger Field|Cheraw|US|S0
HCZ|Chenzhou Beihu Airport|Chenzhou|CN|M1
HDD|Hyderabad Airport|Hyderabad|PK|S1
HDE|Brewster Field|Holdrege|US|S0
HDF|Heringsdorf Airport|Zirchow|DE|M1
HDG|Handan Airport|Handan|CN|M1
HDH|Kawaihapai Airfield|Mokuleia|US|S0
HDK|Kulhudhuffushi Airport|Kulhudhuffushi|MV|S1
HDM|Hamadan Airport|Hamadan|IR|M1
HDN|Yampa Valley Airport|Hayden|US|M1
HDO|Hindon Airport / Hindon Air Force Station|Ghaziabad|IN|S1
HDR|Havadarya Airport|Bandar Abbas|IR|S0
HDS|Eastgate Airport / Air Force Base Hoedspruit|Hoedspruit|ZA|M1
HDY|Hat Yai International Airport|Hat Yai|TH|L1
HEA|Herat - Khwaja Abdullah Ansari International Airport|Guzara|AF|L1
HEB|Hinthada Airport|Hinthada|MM|S0
HED|Herendeen Bay Airport|Herendeen Bay|US|S0
HEE|Thompson-Robbins Airport|West Helena|US|S0
HEG|Heglig Airport|Heglig|SD|S0
HEH|Heho Airport|Heho|MM|M1
HEI|Heide-Büsum Airport|Oesterdeichstrich|DE|S1
HEK|Heihe Aihui Airport|Heihe|CN|M1
HEL|Helsinki Vantaa Airport|Helsinki (Vantaa)|FI|L1
HEO|Haelogo Airport|Haelogo|PG|S0
HER|Heraklion International Nikos Kazantzakis Airport|Heraklion|GR|L1
HES|Hermiston Municipal Airport|Hermiston|US|S0
HET|Hohhot Baita International Airport|Hohhot|CN|L1
HEW|Dongyang Hengdian General Airport|Jinhua (Dongyang)|CN|S0
HEZ|Natchez–Adams County Airport / Hardy-Anders Field|Natchez|US|S0
HFA|Uri Michaeli Haifa International Airport|Haifa|IL|M1
HFD|Hartford Brainard Airport|Hartford|US|M0
HFE|Hefei Xinqiao International Airport|Hefei|CN|L1
HFF|Mackall Army Air Field|Hoffman|US|S0
HFN|Hornafjörður Airport|Höfn|IS|M1
HFS|Hagfors Airport|Råda|SE|S1
HFT|Hammerfest Airport|Hammerfest|NO|M1
HGA|Egal International Airport|Hargeisa|SO|L1
HGD|Hughenden Airport|Hughenden|AU|S1
HGE|Higuerote Airport|Higuerote|VE|S0
HGH|Hangzhou Xiaoshan International Airport|Hangzhou|CN|L1
HGI|Itanagar Donyi Polo Hollongi Airport|Hollongi|IN|M1
HGL|Helgoland-Düne Airport|Helgoland|DE|S1
HGN|Mae Hong Son Airport|Mae Hong Son|TH|M1
HGO|Korhogo Airport|Korhogo|CI|M1
HGR|Hagerstown Regional Richard A Henson Field|Hagerstown|US|M1
HGS|Hastings Airport|Freetown|SL|S0
HGU|Mount Hagen Kagamuga Airport|Mount Hagen|PG|M1
HGZ|Hog River Airport|Hogatza|US|S0
HHE|JMSDF Hachinohe Air Base / Hachinohe Airport|Hachinohe|JP|M0
HHH|Hilton Head Airport|Hilton Head Island|US|M1
HHI|Wheeler Army Airfield|Wahiawa|US|S0
HHN|Frankfurt-Hahn Airport|Frankfurt am Main (Lautzenhausen)|DE|L1
HHQ|Hua Hin Airport|Hua Hin|TH|M1
HHR|Jack Northrop Field Hawthorne Municipal Airport|Hawthorne|US|M1
HHZ|Hikueru Airport|Hikueru|PF|S1
HIA|Huai'an Lianshui Airport|Huai'an|CN|L1
HIB|Range Regional Airport|Hibbing|US|M1
HID|Horn Island Airport|Horn|AU|M1
HIE|Mount Washington Regional Airport|Whitefield|US|S0
HIF|Hill Air Force Base|Ogden|US|M0
HIG|Highbury Airport|Highbury|AU|S0
HII|Lake Havasu City Airport|Lake Havasu City|US|M1
HIJ|Hiroshima Airport|Hiroshima|JP|L1
HIL|Shilavo Airport|Shilavo|ET|S1
HIM|Hingurakgoda Air Force Base|Polonnaruwa Town|LK|M0
HIN|Sacheon Airport / Sacheon Air Base|Sacheon|KR|M1
HIO|Portland Hillsboro Airport|Portland|US|M0
HIP|Headingly Airport||AU|S0
HIR|Honiara International Airport|Honiara|SB|L1
HIT|Haivaro Airport|Haivaro|PG|S0
HJB|Hejing Bayinbuluke Airport|Hejing|CN|S1
HJJ|Huaihua Zhijiang Airport|Huaihua|CN|M1
HJR|Khajuraho Airport|Khajuraho|IN|M1
HJT|Khujirt Airport|Khujirt|MN|S0
HKA|Blytheville Municipal Airport|Blytheville|US|S0
HKB|Healy Lake Airport|Healy Lake|US|S0
HKD|Hakodate Airport|Hakodate|JP|L1
HKG|Hong Kong International Airport|Hong Kong|HK|L1
HKK|Hokitika Airfield||NZ|M1
HKN|Hoskins Airport|Kimbe|PG|M1
HKR|Mara North Conservancy Airstrip|Mara Rianta|KE|S0
HKS|Hawkins Field|Jackson|US|S0
HKT|Phuket International Airport|Phuket|TH|L1
HKY|Hickory Regional Airport|Hickory|US|M0
HLA|Lanseria International Airport|Johannesburg|ZA|L1
HLB|Batesville Airport|Batesville|US|S0
HLC|Hill City Municipal Airport|Hill City|US|S0
HLD|Hulunbuir Hailar Airport|Hailar|CN|L1
HLE|Saint Helena International Airport|Jamestown|SH|M1
HLF|Hultsfred Airport|Hultsfred|SE|S0
HLG|Wheeling Ohio County Airport|Wheeling|US|M0
HLH|Ulanhot Yilelite Airport|Ulanhot|CN|S1
HLI|Hollister Municipal Airport|Hollister|US|S0
HLJ|Zhaodong Beidahuang General Airport|Suihua|CN|S0
HLL|Hillside Airport|Hillside|AU|S0
HLM|Park Township Airport|Holland|US|S0
HLN|Helena Regional Airport|Helena|US|M1
HLP|Halim Perdanakusuma International Airport|Jakarta|ID|L1
HLS|St Helens Airport||AU|S0
HLT|Hamilton Airport||AU|M0
HLV|Helenvale Airport|Helenvale|AU|S0
HLW|Hluhluwe Airport|Hluhluwe|ZA|S0
HLZ|Hamilton International Airport|Hamilton|NZ|M1
HMA|Khanty Mansiysk Airport|Khanty-Mansiysk|RU|M1
HMB|Suhaj International Airport|Suhaj|EG|L1
HME|Hassi Messaoud-Oued Irara Krim Belkacem Airport|Hassi Messaoud|DZ|M1
HMG|Hermannsburg Airport|Hermannsburg (Ntaria)|AU|S0
HMI|Hami Airport|Hami|CN|M1
HMJ|Khmelnytskyi Airport|Khmelnytskyi|UA|M0
HMN|Holloman Air Force Base|Alamogordo|US|M0
HMO|General Ignacio L. Pesqueira International Airport|Hermosillo|MX|L1
HMR|Hamar Lufthavn, Stavsberg|Hamar|NO|S0
HMS|Haji Muhammad Sidik Airport|Muara Teweh|ID|S1
HMT|Hemet Ryan Airport|Hemet|US|S0
HMV|Hemavan Airport|Hemavan|SE|S1
HMY|Seosan Air Base|Seosan|KR|S0
HNA|Iwate Hanamaki Airport|Hanamaki|JP|M1
HNB|Huntingburg Airport|Huntingburg|US|S0
HNC|Billy Mitchell Airport|Hatteras|US|S0
HND|Tokyo Haneda International Airport|Tokyo|JP|L1
HNG|Hainanzhou Gonghe Airport|Hainan (Gonghe)|CN|M0
HNH|Hoonah Airport|Hoonah|US|S1
HNI|Heiweni Airport|Heiweni|PG|S0
HNL|Daniel K. Inouye International Airport|Honolulu, Oahu|US|L1
HNM|Hana Airport|Hana|US|M1
HNN|Honinabi Airport|Honinabi|PG|S0
HNS|Haines Airport|Haines|US|M1
HNY|Hengyang Nanyue Airport|Hengyang|CN|S1
HOA|Hola Airport|Hola|KE|S0
HOB|Lea County Regional Airport|Hobbs|US|M1
HOC|Komako Airport|Komako|PG|S0
HOE|Ban Huoeisay Airport|Huay Xai|LA|S0
HOF|Al-Ahsa International Airport|Hofuf|SA|L1
HOG|Frank Pais International Airport|Holguin|CU|L1
HOH|Hohenems-Dornbirn Airfield|Hohenems|AT|S0
HOI|Hao Airport|Otepa|PF|M1
HOK|Hooker Creek Airport|Lajamanu|AU|S1
HOM|Homer Airport|Homer|US|M1
HON|Huron Regional Airport|Huron|US|M0
HOO|Nhon Co Airfield|Đăk R'Lấp|VN|S0
HOP|Campbell Army Airfield (Fort Campbell)|Fort Campbell|US|M0
HOQ|Hof-Plauen Airport|Hof|DE|M0
HOR|Horta Airport|Horta|PT|M1
HOS|Chos Malal Airport|Chos Malal|AR|S0
HOT|Memorial Field Airport|Hot Springs|US|M1
HOU|William P. Hobby Airport|Houston|US|L1
HOV|Ørsta-Volda Airport, Hovden|Ørsta|NO|M1
HOX|Hommalinn Airport|Hommalinn|MM|S0
HPA|Lifuka Island Airport|Lifuka|TO|M1
HPB|Hooper Bay Airport|Hooper Bay|US|S1
HPE|Hope Vale Airport|Hope Vale|AU|S0
HPG|Shennongjia Hongping Airport|Shennongjia (Hongping)|CN|M1
HPH|Cat Bi International Airport|Haiphong (Hai An)|VN|L1
HPN|Westchester County Airport|White Plains|US|M1
HPT|Hampton Municipal Airport|Hampton|US|S0
HPV|Princeville Airport|Hanalei|US|S0
HPY|Baytown Airport|Baytown|US|S0
HQL|Tashikuergan Hongqilafu Airport|Tashikuergan|CN|M1
HQM|Bowerman Airport|Hoquiam|US|M0
HQQ|Anyang Hongqiqu Airport|Anyang|CN|S1
HRA|Mnichovo Hradiště Airport|Mnichovo Hradiště|CZ|S0
HRB|Harbin Taiping International Airport|Harbin|CN|L1
HRC|Sary Su Airport|Zhayrem|KZ|S0
HRE|Robert Gabriel Mugabe International Airport|Harare|ZW|L1
HRF|Hoarafushi Airport||MV|S1
HRG|Hurghada International Airport|Hurghada|EG|L1
HRH|Aligarh Airport|Aligarh|IN|S0
HRI|Mattala Rajapaksa International Airport|Mattala|LK|M1
HRK|Kharkiv International Airport|Kharkiv|UA|M0
HRL|Valley International Airport|Harlingen|US|M1
HRM|Hassi R'Mel Airport|Hassi R'Mel|DZ|M0
HRO|Boone County Airport|Harrison|US|M1
HRR|Herrera Airport|Campiña|CO|S0
HRS|Harrismith Airport|Harrismith|ZA|M0
HRY|Henbury Airport|Ghan|AU|S0
HRZ|Walter Bündchen Airport|Horizontina|BR|S0
HSA|Hazrat Sultan International Airport|Turkıstan|KZ|L1
HSB|Harrisburg-Raleigh Airport|Harrisburg|US|S0
HSC|Shaoguan Danxia Airport|Shaoguan|CN|M1
HSF|Suifenhe Dongning Airport|Suifenhe|CN|S0
HSG|Kyushu Saga International Airport|Saga|JP|L1
HSH|Henderson Executive Airport|Las Vegas|US|S0
HSI|Hastings Municipal Airport|Hastings|US|S0
HSJ|Zhengzhou Shangjie Airport|Zhengzhou|CN|S0
HSK|Huesca-Pirineos Airport|Monflorite/Alcalá del Obispo|ES|S0
HSL|Huslia Airport|Huslia|US|M1
HSM|Horsham Airport||AU|M0
HSN|Zhoushan Putuoshan International Airport|Zhoushan|CN|L1
HSP|Ingalls Field|Hot Springs|US|S0
HSR|Rajkot International Airport|Rajkot|IN|L1
HSS|Maharaja Agrasen International Airport|Hisar|IN|L1
HST|Homestead Air Reserve Base|Homestead|US|M0
HSV|Huntsville International Airport|Huntsville|US|M1
HSZ|Hsinchu Air Base|Hsinchu City|TW|M0
HTA|Chita-Kadala International Airport|Chita|RU|L1
HTG|Khatanga Airport|Khatanga|RU|M1
HTH|Hawthorne Industrial Airport|Hawthorne|US|S0
HTI|Hamilton Island Airport|Hamilton Island|AU|M1
HTL|Roscommon County - Blodgett Memorial Airport|Houghton Lake|US|S0
HTM|Khatgal Airport|Hatgal|MN|S0
HTN|Hotan Airport|Hotan|CN|M1
HTO|Town of East Hampton Airport|East Hampton|US|S0
HTR|Hateruma Airport|Taketomi|JP|S0
HTS|Tri-State Airport / Milton J. Ferguson Field|Huntington|US|M1
HTT|Huatugou Airport|Mengnai|CN|M1
HTU|Hopetoun Airport||AU|M0
HTV|Huntsville Regional Airport|Huntsville|US|M0
HTW|Lawrence County Airpark|South Point|US|S0
HTY|Hatay Airport|Antakya|TR|M1
HTZ|Hato Corozal Airport|Hato Corozal|CO|S0
HUA|Redstone Army Air Field|Redstone Arsnl Huntsville|US|M0
HUB|Humbert River Airport||AU|S0
HUC|Dr Hermenegildo Ortiz Quinones Airport|Humacao|PR|S0
HUD|Humboldt Municipal Airport|Humboldt|US|S0
HUE|Humera Airport|Akwi|ET|S1
HUF|Terre Haute Regional Airport, Hulman Field|Terre Haute|US|M0
HUG|Huehuetenango Airport|Huehuetenango|GT|S1
HUH|Huahine-Fare Airport|Fare|PF|M1
HUI|Phu Bai International Airport|Huế|VN|L1
HUJ|Stan Stamper Municipal Airport|Hugo|US|S0
HUK|Hukuntsi Airport|Hukuntsi|BW|S0
HUL|Houlton International Airport|Houlton|US|M0
HUM|Houma Terrebonne Airport|Houma|US|S0
HUN|Hualien Chiashan Airport|Hualien City|TW|L1
HUO|Holingol Huolinhe Airport|Holingol|CN|M1
HUQ|Hon Airport||LY|S0
HUS|Hughes Airport|Hughes|US|S1
HUT|Hutchinson Municipal Airport|Hutchinson|US|M0
HUU|Alferez Fap David Figueroa Fernandini Airport|Huánuco|PE|M1
HUV|Hudiksvall Airport|Hudiksvall|SE|S0
HUW|Humaitá Airport|Humaitá|BR|S0
HUX|Bahías de Huatulco International Airport|Huatulco|MX|L1
HUY|Humberside Airport|Grimsby, Lincolnshire|GB|M1
HUZ|Huizhou Pingtan Airport|Huizhou (Pingtan)|CN|M1
HVA|Analalava Airport|Analalava|MG|M0
HVB|Hervey Bay Airport|Hervey Bay|AU|M1
HVD|Khovd Airport|Khovd|MN|M1
HVE|Hanksville Airport|Hanksville|US|S0
HVG|Honningsvåg Airport, Valan|Honningsvåg|NO|M1
HVK|Hólmavík Airport|Hólmavík|IS|S0
HVN|Tweed New Haven Airport|New Haven|US|M1
HVR|Havre City County Airport|Havre|US|M1
HVS|Hartsville Regional Airport|Hartsville|US|S0
HWA|Hawabango Airport|Hawabango|PG|S0
HWD|Hayward Executive Airport|Hayward|US|S0
HWK|Wilpena Pound Airport|Hawker|AU|S0
HWN|Hwange National Park Airport|Gwayi River Farms|ZW|M0
HWO|North Perry Airport|Hollywood|US|M0
HWR|Halwara International Airport|Halwara|IN|L1
HXD|Haixi Delingha Airport|Delingha|CN|M1
HXX|Hay Airport||AU|M0
HYA|Cape Cod Gateway Airport|Hyannis|US|M1
HYC|Wycombe Air Park|Marlow, Buckinghamshire|GB|S0
HYD|Rajiv Gandhi International Airport|Hyderabad|IN|L1
HYF|Hayfields Airport|Bainyik|PG|S0
HYN|Taizhou Luqiao Airport|Taizhou (Luqiao)|CN|M1
HYR|Sawyer County Airport|Hayward|US|M0
HYS|Hays Regional Airport|Hays|US|M1
HYV|Hyvinkää Airfield|Hyvinkää|FI|S0
HZA|Heze Mudan Airport|Heze (Dingtao)|CN|M1
HZB|Merville-Calonne Airport|Merville, Nord|FR|M0
HZG|Hanzhong Chenggu Airport|Hanzhong (Chenggu)|CN|M1
HZH|Liping Airport|Liping|CN|M1
HZK|Húsavík Airport|Húsavík|IS|M0
HZL|Hazleton Municipal Airport|Hazleton|US|S0
HZP|Fort Mackay / Horizon Airport|Fort Mackay|CA|S0
HZU|Chengdu Huaizhou Airport|Chengdu (Jintang)|CN|M0
HZV|Hazyview Airport|Hazyview|ZA|S0
IAA|Igarka Airport|Igarka|RU|M1
IAB|McConnell Air Force Base|Wichita|US|M0
IAD|Washington Dulles International Airport|Dulles|US|L1
IAG|Niagara Falls International Airport|Niagara Falls|US|M1
IAH|George Bush Intercontinental Airport|Houston|US|L1
IAL|Salinas Municipal Airport|Salinas|BR|S0
IAM|Zarzaitine - In Aménas Airport|In Aménas|DZ|M1
IAN|Bob Baker Memorial Airport|Kiana|US|M1
IAO|Siargao Airport|Del Carmen|PH|S1
IAQ|Bahregan Airport|Imam Hassan|IR|S0
IAR|Golden Ring Yaroslavl International Airport|Tunoshna|RU|L1
IAS|Iaşi International Airport|Iaşi|RO|L1
IAX|Miangas Airport|Miangas|ID|S0
IBA|Ibadan Airport|Ibadan|NG|M1
IBB|General Villamil Airport|Puerto Villamil|EC|S1
IBE|Perales Airport|Ibagué|CO|M1
IBI|Iboki Airport|Iboki|PG|S0
IBL|Indigo Bay Lodge Airport|Bazaruto Island|MZ|M0
IBM|Iron Bridge Mine Airport|Japal Camp|AU|S0
IBO|Ibo Airport|Ibo|MZ|S0
IBP|Iberia Airport|Iberia|PE|M0
IBR|Ibaraki Airport|Omitama|JP|L1
IBZ|Ibiza Airport|Ibiza (Eivissa)|ES|L1
ICA|Ikabaru Airport|Ikabarú|VE|S0
ICC|Andrés Miguel Salazar Marcano Airport|Isla de Coche|VE|S1
ICI|Cicia Airport|Cicia|FJ|S1
ICK|Nieuw Nickerie - Major Henk Fernandes Airport|Nieuw Nickerie|SR|S0
ICL|Schenck Field|Clarinda|US|S0
ICN|Incheon International Airport|Seoul|KR|L1
ICO|Sicogon Airstrip|Carles|PH|S0
ICS|Cascade Airport|Cascade|US|S0
ICT|Wichita Dwight D. Eisenhower National Airport|Wichita|US|M1
ICY|Icy Bay Airport|Icy Bay|US|S0
IDA|Idaho Falls Regional Airport|Idaho Falls|US|M1
IDB|Idre Airport|Idre|SE|S0
IDF|Idiofa Airport|Idiofa|CD|S0
IDG|Ida Grove Municipal Airport|Ida Grove|US|S0
IDH|Idaho County Airport|Grangeville|US|S0
IDI|Indiana County–Jimmy Stewart Airport|Indiana|US|S0
IDK|Indulkana Airport|Indulkana|AU|S0
IDN|Indagen Airport|Indagen|PG|S0
IDO|Santa Izabel do Morro Airport|Cristalândia|BR|S0
IDP|Independence Municipal Airport|Independence|US|S0
IDR|Devi Ahilya Bai Holkar International Airport|Indore|IN|L1
IDY|Île d'Yeu Airport|Île d'Yeu|FR|S0
IEG|Zielona Góra-Babimost Airport|Nowe Kramsko|PL|M1
IEJ|Iejima Airport|Ie|JP|M0
IES|Riesa-Göhlis Airport|Riesa|DE|S0
IEV|Igor Sikorsky Kyiv International Airport (Zhuliany)|Kyiv|UA|M0
IFA|Iowa Falls Municipal Airport|Iowa Falls|US|S0
IFF|Iffley Airport||AU|S0
IFH|Hesa Airport|Hesa|IR|S0
IFJ|Ísafjörður Airport|Ísafjörður|IS|M1
IFL|Innisfail Airport||AU|S0
IFN|Isfahan Shahid Beheshti International Airport|Isfahan|IR|L1
IFO|Ivano-Frankivsk International Airport|Ivano-Frankivsk|UA|M0
IFP|Laughlin Bullhead International Airport|Bullhead City|US|M0
IFU|Ifuru Airport|Ifuru Island|MV|S0
IGA|Inagua Airport|Matthew Town|BS|M1
IGB|Ingeniero Jacobacci - Captain H R Bordón Airport|Ingeniero Jacobacci|AR|S0
IGD|Iğdır Airport|Iğdır|TR|M1
IGE|Tchongorove Airport|Iguela|GA|S0
IGG|Igiugig Airport|Igiugig|US|S1
IGH|Ingham Airport||AU|S0
IGL|Çiğli Airbase|Çiğli|TR|M0
IGM|Kingman Airport|Kingman|US|M0
IGN|Maria Cristina (Iligan) Airport|Balo-i|PH|S0
IGO|Jaime Ortiz Betancourt Airport|Chigorodó|CO|S0
IGR|Cataratas Del Iguazú International Airport|Puerto Iguazu|AR|M1
IGS|Ingolstadt Manching Airport|Manching|DE|M0
IGT|Magas Airport|Sunzha|RU|M1
IGU|Cataratas International Airport|Foz do Iguaçu|BR|L1
IHC|Inhaca Airport|Inhaca|MZ|S0
IHO|Ihosy Airport|Ihosy|MG|S0
IHR|Iranshahr Airport|Iranshahr|IR|M0
IHU|Ihu Airport|Ihu|PG|S0
IIA|Inishmaan Aerodrome|Inis Meáin|IE|S1
IIL|Ilam Airport|Ilam|IR|M0
IIS|Nissan Island Airport|Nissan Island|PG|S0
IJK|Izhevsk Airport|Izhevsk|RU|M1
IJU|João Batista Bos Filho Airport|Ijuí|BR|S0
IJX|Jacksonville Municipal Airport|Jacksonville|US|S0
IKA|Imam Khomeini International Airport|Tehran|IR|L1
IKB|Wilkes County Airport|North Wilkesboro|US|S0
IKG|Karakol International Airport|Karakol|KG|M1
IKI|Iki Airport|Iki|JP|M1
IKK|Greater Kankakee Airport|Kankakee|US|M0
IKL|Ikela Airport|Ikela|CD|S0
IKO|Nikolski Air Station|Nikolski|US|S1
IKP|Inkerman Airport|Inkerman|AU|S0
IKS|Tiksi Airport|Tiksi|RU|M1
IKT|Irkutsk International Airport|Irkutsk|RU|L1
IKU|Issyk-Kul International Airport|Tamchy|KG|L1
ILA|Ilaga Airport|Ilaga|ID|S0
ILD|Lleida-Alguaire Airport|Lleida|ES|M1
ILE|Skylark Field|Killeen|US|S0
ILF|Ilford Airport|Ilford|CA|S1
ILG|Wilmington Airport|Wilmington|US|M1
ILI|Iliamna Airport|Iliamna|US|M1
ILK|Atsinanana Airport|Ilaka|MG|S0
ILL|Willmar Municipal Airport John L Rice Field (2006)|Willmar|US|S0
ILM|Wilmington International Airport|Wilmington|US|M1
ILN|Wilmington Airpark|Wilmington|US|M0
ILO|Iloilo International Airport|Cabatuan|PH|L1
ILP|Île des Pins Airport|Île des Pins|NC|M1
ILQ|General Jorge Fernandez Maldon Airport|Ilo|PE|M1
ILR|General Tunde Idiagbon International Airport|Ilorin/Ogbomosho|NG|L1
ILS|Ilopango International Airport|San Salvador|SV|M1
ILU|Kilaguni Airport|Kilaguni|KE|S0
ILY|Islay Airport|Isle of Islay, Argyll and Bute|GB|M1
ILZ|Žilina-Dolný Hričov Airport|Dolný Hričov|SK|M0
IMA|Iamalele Airport|Iamalele, Fergusson Island|PG|S0
IMB|Imbaimadai Airport|Imbaimadai|GY|S0
IMD|Imonda Airport|Imonda|PG|S0
IMF|Bir Tikendrajit International Airport|Imphal|IN|L1
IMG|Inhaminga Airport|Inhaminga|MZ|S0
IMK|Simikot Airport|Simikot|NP|S1
IML|Imperial Municipal Airport|Imperial|US|S0
IMM|Immokalee Regional Airport|Immokalee|US|S0
IMN|Imane Airport|Imane|PG|S0
IMO|Zemio Airport|Zemio|CF|S0
IMP|Prefeito Renato Moreira Airport|Imperatriz|BR|M1
IMQ|Maku National Airport|Showt|IR|M0
IMT|Ford Airport|Kingsford|US|M1
IMU|Akimuga Airstrip|Akimuga, Mimika|ID|S0
INA|Inta Airport|Inta|RU|M0
INB|Independence Airport|Independence|BZ|S1
INC|Yinchuan Hedong International Airport|Yinchuan|CN|L1
IND|Indianapolis International Airport|Indianapolis|US|L1
INF|In Guezzam Airport|In Guezzam|DZ|S0
INH|Inhambane Airport|Inhambane|MZ|M1
INI|Niš Constantine the Great Airport|Niš|RS|L1
INJ|Injune Airport|Injune|AU|S0
INK|Winkler County Airport|Wink|US|M0
INL|Falls International Airport|International Falls|US|M1
INM|Innamincka Airport||AU|S0
INN|Innsbruck Airport|Innsbruck|AT|L1
INO|Inongo Airport|Inongo|CD|S1
INQ|Inisheer Aerodrome|Inis Oírr|IE|S1
INS|Creech Air Force Base|Indian Springs|US|S0
INT|Smith Reynolds Airport|Winston Salem|US|M0
INU|Nauru International Airport|Yaren|NR|M1
INV|Inverness Airport|Inverness, Highland|GB|M1
INW|Winslow Lindbergh Regional Airport|Winslow|US|M0
INX|Inanwatan Airport|Inanwatan|ID|S0
INY|Inyati Airport|Inyati|ZA|S0
INZ|In Salah Airport|In Salah|DZ|M1
IOA|Ioannina King Pyrrhus National Airport|Ioannina|GR|M1
IOK|Iokea Airport|Iokea|PG|S0
IOM|Isle of Man Airport|Castletown, Rushen|IM|L1
ION|Impfondo Airport|Impfondo|CG|S0
IOP|Ioma Airport|Ioma|PG|S0
IOR|Inishmore Aerodrome|Inis Mór|IE|S1
IOS|Bahia - Jorge Amado Airport|Ilhéus|BR|M1
IOW|Iowa City Municipal Airport|Iowa City|US|S0
IPA|Ipota Airport|Ipota|VU|S0
IPC|Mataveri International Airport|Isla De Pascua|CL|L1
IPE|Ipil Airport|Ipil|PH|S0
IPG|Ipiranga Airport|Santo Antônio do Içá|BR|S0
IPH|Sultan Azlan Shah Airport|Ipoh|MY|L1
IPI|San Luis Airport|Ipiales|CO|M1
IPL|Imperial County Airport|Imperial|US|M1
IPN|Usiminas Airport|Ipatinga|BR|M1
IPT|Williamsport Regional Airport|Williamsport|US|M1
IPU|Ipiaú Airport|Ipiaú|BR|S0
IPZ|San Isidro del General Airport|Pérez Zeledón|CR|S0
IQA|Al Asad Air Base|Hīt|IQ|M0
IQM|Qiemo Yudu Airport|Qiemo|CN|M1
IQN|Qingyang Xifeng Airport|Qingyang (Xifeng)|CN|M1
IQQ|Diego Aracena International Airport|Iquique|CL|L1
IQT|Coronel FAP Francisco Secada Vignetta International Airport|Iquitos|PE|L1
IRA|Ngorangora Airport|Kirakira|SB|S1
IRB|Iraan Municipal Airport|Iraan|US|S0
IRC|Circle City (New) Airport|Circle|US|S1
IRD|Ishurdi Airport|Ishurdi|BD|M0
IRE|Irecê Airport|Irecê|BR|S0
IRG|Lockhart River Airport|Lockhart River|AU|M1
IRI|Iringa Airport|Nduli|TZ|M0
IRJ|Capitan V A Almonacid Airport|La Rioja|AR|M1
IRK|Kirksville Regional Airport|Kirksville|US|M1
IRM|Igrim Airport||RU|S0
IRN|Iriona Airport|Iriona|HN|S0
IRO|Birao Airport|Birao|CF|S0
IRP|Matari Airport|Isiro|CD|M1
IRS|Kirsch Municipal Airport|Sturgis|US|S0
IRZ|Tapuruquara Airport|Santa Isabel do Rio Negro|BR|S1
ISA|Mount Isa Airport|Mount Isa|AU|M1
ISB|Islamabad International Airport|Attock|PK|L1
ISC|St. Mary's Airport|St. Mary's, Isles of Scilly|GB|S1
ISD|Santa Bárbara Airport|Iscuandé|CO|S0
ISE|Süleyman Demirel International Airport|Isparta|TR|M1
ISG|New Ishigaki Airport|Ishigaki|JP|M1
ISI|Isisford Airport||AU|S0
ISJ|Isla Mujeres National Airport|Isla Mujeres|MX|S0
ISK|Nashik International Airport|Nashik|IN|L1
ISL|İstanbul Atatürk Airport|Istanbul(Bakırköy)|TR|L0
ISM|Kissimmee Gateway Airport|Orlando|US|M0
ISO|Kinston Regional Jetport At Stallings Field|Kinston|US|M0
ISP|Long Island MacArthur Airport|Islip|US|M1
ISQ|Schoolcraft County Airport|Manistique|US|S0
ISS|Wiscasset Airport|Wiscasset|US|S0
IST|İstanbul Airport|Istanbul|TR|L1
ISU|Jalal Talabani International Airport|Sulaymaniyah|IQ|M1
ISW|Alexander Field South Wood County Airport|Wisconsin Rapids|US|S0
ITA|Itacoatiara Airport|Itacoatiara|BR|M0
ITB|Itaituba Airport|Itaituba|BR|M1
ITE|Ituberá Airport|Ituberá|BR|S0
ITH|Ithaca Tompkins Regional Airport|Ithaca|US|M1
ITI|Fazenda Americana Airport|Itambacuri|BR|S0
ITJ|Campo Comandantes Airport|Itajaí|BR|S0
ITK|Itokama Airport|Itokama|PG|S0
ITM|Osaka Itami International Airport|Osaka|JP|L1
ITN|Tertuliano Guedes de Pinho Airport|Itabuna|BR|S0
ITO|Hilo International Airport|Hilo|US|M1
ITP|Itaperuna Airport|Itaperuna|BR|S0
ITQ|Itaqui Airport|Itaqui|BR|S0
ITR|Francisco Vilela do Amaral Airport|Itumbiara|BR|S0
ITU|Iturup Airport|Kurilsk|RU|S1
IUA|Canandaigua Airport|Ontario County IDA|US|S0
IUE|Niue International Airport|Alofi|NU|M1
IUL|Ilu Airport|Ilu|ID|S0
IUP|Apuí Airport|Apuí|BR|S0
IVA|Ampampamena Airport||MG|S0
IVC|Invercargill Airport|Invercargill|NZ|M1
IVD|Nusantara International Airport|Nusantara|ID|M0
IVG|Berane Airport|Berane|ME|S0
IVI|Viveros Island Airport|Isla Viveros|PA|S0
IVL|Ivalo Airport|Ivalo|FI|L1
IVO|Chivolo Airport|Chivolo|CO|S0
IVR|Inverell Airport|Inverell|AU|M0
IVW|Inverway Airport|Inverway|AU|S0
IWA|Ivanovo South Airport|Ivanovo|RU|M1
IWD|Gogebic Iron County Airport|Ironwood|US|S1
IWJ|Iwami Airport|Masuda|JP|M1
IWK|Iwakuni Kintaikyo Airport|Iwakuni|JP|M1
IWO|Ioto (Iwo Jima) Airbase|Ogasawara|JP|M0
IWS|West Houston Airport|Houston|US|S0
IXA|Agartala - Maharaja Bir Bikram Airport|Agartala|IN|M1
IXB|Bagdogra Airport|Siliguri|IN|L1
IXC|Shaheed Bhagat Singh International Airport|Chandigarh|IN|L1
IXD|Prayagraj Airport|Allahabad|IN|M1
IXE|Mangaluru International Airport|Mangaluru|IN|L1
IXG|Belagavi Airport|Belgaum|IN|M1
IXH|Kailashahar Airport|Kailashahar|IN|M0
IXI|Lilabari North Lakhimpur Airport|Lilabari|IN|M1
IXJ|Jammu Airport|Jammu|IN|M1
IXK|Keshod Airport|Keshod|IN|M1
IXL|Leh Kushok Bakula Rimpochee Airport|Leh|IN|M1
IXM|Madurai Airport|Madurai|IN|M1
IXN|Khowai Airport|Khowai|IN|S0
IXP|Pathankot Airport|Pathankot|IN|M1
IXQ|Kamalpur Airport|Manik Bhandar|IN|S0
IXR|Birsa Munda Airport|Ranchi|IN|M1
IXS|Silchar Airport|Silchar|IN|M1
IXT|Pasighat Airport|Pasighat|IN|S0
IXU|Aurangabad Airport|Aurangabad|IN|M1
IXV|Along Airport||IN|M0
IXW|Sonari Airport|Jamshedpur|IN|M0
IXX|Bidar Airport / Bidar Air Force Station|Bidar|IN|M0
IXY|Kandla Airport|Kandla|IN|M1
IXZ|Veer Savarkar International Airport / INS Utkrosh|Port Blair|IN|L1
IYK|Inyokern Airport|Inyokern|US|S0
IZA|Presidente Itamar Franco Airport|Juiz de Fora|BR|M1
IZE|Itzehoe Hungriger Wolf Airfield|Hohenlockstedt|DE|S0
IZM|Selçuk Efes Airport|Selçuk|TR|S0
IZO|Izumo Enmusubi Airport|Izumo|JP|M1
IZT|General Antonio Cárdenas Rodríguez National Airport / Ixtepec Air Base|Ixtepec|MX|M1
JAA|Jalalabad Airport|Jalalabad|AF|M0
JAB|Jabiru Airport||AU|S0
JAC|Jackson Hole Airport|Jackson|US|M1
JAD|Perth Jandakot Airport|Perth|AU|M0
JAE|Shumba Airport|Jaén|PE|M1
JAF|Jaffna International Airport|Jaffna|LK|L1
JAG|Shahbaz Air Base|Jacobabad|PK|M0
JAI|Jaipur International Airport|Jaipur|IN|L1
JAK|Jacmel Airport|Jacmel|HT|M0
JAL|El Lencero Airport|Emiliano Zapata|MX|M0
JAM|Bezmer Air Base|Bezmer|BG|M0
JAN|Jackson-Medgar Wiley Evers International Airport|Jackson|US|M1
JAP|Chacarita Airport|Puntarenas|CR|S0
JAQ|Jacquinot Bay Airport|Jacquinot Bay|PG|S0
JAR|Jahrom Airport|Jahrom|IR|S0
JAS|Jasper County Airport Bell Field|Jasper|US|S0
JAT|Jabot Airport|Ailinglapalap Atoll|MH|S0
JAU|Francisco Carle Airport|Jauja|PE|M1
JAV|Ilulissat Airport|Ilulissat|GL|M1
JAW|Araripina Airport|Araripina|BR|S0
JAX|Jacksonville International Airport|Jacksonville|US|L1
JBB|Notohadinegoro Airport|Jember|ID|S1
JBK|Qitai Jiangbulake Airport|Qitai|CN|S1
JBQ|La Isabela International Airport|La Isabela|DO|M1
JBR|Jonesboro Municipal Airport|Jonesboro|US|M1
JBS|São Borja Airport|São Borja|BR|S0
JCB|Santa Terezinha Airport|Joaçaba|BR|S0
JCI|New Century AirCenter Airport|New Century|US|S0
JCK|Julia Creek Airport||AU|S1
JCL|České Budějovice South Bohemian Airport|České Budějovice|CZ|L1
JCM|Jacobina Airport|Jacobina|BR|S0
JCR|Jacareacanga Airport|Jacareacanga|BR|M0
JCS|Crateús Airport|Crateús|BR|S0
JCT|Kimble County Airport|Junction|US|M0
JCY|LBJ Ranch Airport|Stonewall|US|S0
JDA|Grant County Regional Airport / Ogilvie Field|John Day|US|S0
JDE|Jiande Qiandaohu General Airport|Hangzhou|CN|M0
JDF|Francisco de Assis Airport|Juiz de Fora|BR|M1
JDG|Jeongseok Airport|Jeju Island|KR|M0
JDH|Jodhpur Airport|Jodhpur|IN|M1
JDN|Jordan Airport|Jordan|US|S0
JDO|Orlando Bezerra de Menezes Airport|Juazeiro do Norte|BR|S1
JDR|Prefeito Octávio de Almeida Neves Airport|São João Del Rei|BR|S0
JDZ|Jingdezhen Luojia Airport|Jingdezhen|CN|M1
JED|King Abdulaziz International Airport|Jeddah|SA|L1
JEE|Jérémie Airport|Carrefour Sanon|HT|M1
JEF|Jefferson City Memorial Airport|Jefferson City|US|S0
JEG|Aasiaat Airport|Aasiaat|GL|M1
JEJ|Jeh Airport|Ailinglapalap Atoll|MH|S1
JEK|Jeki Airport|Jeki|ZM|S0
JEQ|Jequié Airport|Jequié|BR|S0
JER|Jersey Airport|St. Peter|JE|M1
JFK|John F. Kennedy International Airport|New York|US|L1
JFN|Northeast Ohio Regional Airport|Ashtabula|US|M0
JFR|Paamiut Airport|Paamiut|GL|S1
JGA|Jamnagar Airport|Jamnagar|IN|M1
JGB|Jagdalpur Airport|Jagdalpur|IN|S1
JGD|Daxing'anling Elunchun Airport|Jiagedaqi|CN|M1
JGN|Jiayuguan International Airport|Jiayuguan|CN|L1
JGS|Jinggangshan Airport|Ji'an|CN|M1
JHB|Senai International Airport|Johor Bahru|MY|L1
JHF|São Paulo Catarina Executive Airport|São Roque|BR|M0
JHG|Xishuangbanna Gasa International Airport|Jinghong (Gasa)|CN|L1
JHL|Fort MacKay/Albian Aerodrome|Albian Village|CA|S0
JHM|Kapalua Airport|Lahaina|US|M1
JHN|Jenderal Besar Abdul Haris Nasution Airport|Mandailing|ID|S0
JHS|Sisimiut Airport|Sisimiut|GL|M1
JHW|Chautauqua County-Jamestown Airport|Jamestown|US|M0
JIA|Juína Airport|Juína|BR|S0
JIB|Djibouti-Ambouli Airport|Djibouti City|DJ|L1
JIC|Jinchang Jinchuan Airport|Jinchang|CN|M1
JIJ|Gerad Wilwal International Airport|Jijiga|ET|L1
JIK|Ikaria Airport|Ikaria Island|GR|S1
JIL|Jilin Ertaizi Airport|Jilin|CN|S0
JIM|Jimma Airport|Jimma|ET|M1
JIN|Jinja Airport|Jinja|UG|S0
JIO|Jos Orno Imsula Airport|Tiakur|ID|S1
JIP|Jipijapa Airport|Jipijapa|EC|S0
JIQ|Qianjiang Wulingshan Airport|Qianjiang|CN|M1
JIR|Jiri Airport|Jiri|NP|S0
JIU|Jiujiang Lushan Airport|Jiujiang|CN|S1
JJD|Comandante Ariston Pessoa Airport|Cruz|BR|M1
JJG|Humberto Ghizzo Bortoluzzi Regional Airport|Jaguaruna|BR|S1
JJI|Juanjui Airport|Juanjuí|PE|M0
JJM|Mulika Lodge Airport|Meru-Kinna|KE|S1
JJN|Quanzhou Jinjiang International Airport|Quanzhou|CN|L1
JJU|Qaqortoq Airport|Qaqortoq|GL|M1
JKG|Jönköping Airport|Jönköping|SE|M1
JKH|Chios Island National Airport|Chios Island|GR|M1
JKL|Kalymnos Airport|Kalymnos Island|GR|S1
JKR|Janakpur Airport|Janakpur|NP|M1
JKV|Cherokee County Airport|Jacksonville|US|S0
JLA|Quartz Creek Airport|Cooper Landing|US|S0
JLG|Jalgaon Airport|Jalgaon|IN|S1
JLN|Joplin Regional Airport|Joplin|US|M1
JLR|Jabalpur Airport|Jabalpur|IN|M1
JLS|Jales Airport|Jales|BR|S0
JMA|Aeroporto Elias Breder Airport|Manhuaçu|BR|S0
JMB|Jamba Airport|Jamba|AO|S0
JMJ|Lancang Jingmai Airport|Pu'er (Lancang)|CN|M1
JMK|Mykonos Island National Airport|Mykonos|GR|M1
JMO|Jomsom Airport|Jomsom|NP|S1
JMR|Maricá Airport|Maricá|BR|S0
JMS|Jamestown Regional Airport|Jamestown|US|M1
JMU|Jiamusi Songjiang International Airport|Jiamusi|CN|M1
JNA|Januária Airport|Januária|BR|S0
JNB|O.R. Tambo International Airport|Johannesburg|ZA|L1
JNG|Jining Da'an Airport|Jining|CN|M1
JNH|Jiaxing Nanhu Airport|Xiuzhou, Hangzhou|CN|M1
JNJ|Ja'Aluni Airport|Duqm|OM|S0
JNU|Juneau International Airport|Juneau|US|M1
JNX|Naxos Island National Airport|Naxos|GR|S1
JNZ|Jinzhou Bay Airport|Jinzhou (Linghai)|CN|M1
JOE|Joensuu Airport|Joensuu|FI|M1
JOG|Adisutjipto International Airport|Yogyakarta|ID|M1
JOH|Port St Johns Airport|Port St Johns|ZA|M0
JOI|Lauro Carneiro de Loyola Airport|Joinville|BR|M1
JOJ|Doris Lake|Hope Bay|CA|S0
JOK|Yoshkar-Ola Airport|Yoshkar-Ola|RU|M0
JOL|Jolo Airport|Jolo|PH|M1
JOM|Njombe Airport|Njombe|TZ|S0
JOP|Josephstaal Airport|Josephstaal|PG|S0
JOS|Yakubu Gowon Airport|Jos|NG|M1
JOT|Joliet Regional Airport|Joliet|US|S0
JPA|Presidente Castro Pinto International Airport|João Pessoa|BR|L1
JPE|Nagib Demachki Airport|Paragominas|BR|S1
JPO|Aeroporto Brigadeiro Firmino Ayres|Patos|BR|S0
JPR|Ji-Paraná Airport|Ji-Paraná|BR|S1
JPY|Paraty Airport|Paraty|BR|S0
JQA|Qaarsut Airport|Uummannaq|GL|S1
JQE|Jaqué Airport|Jaqué|PA|S0
JRF|Kalaeloa Airport|Kapolei|US|M0
JRG|Jharsuguda Airport||IN|S1
JRH|Jorhat Airport|Jorhat|IN|M1
JRJ|Ganzhou Ruijin Airport|Ganzhou|CN|S0
JRN|Juruena Airport|Juruena|BR|S0
JRO|Kilimanjaro International Airport|Arusha|TZ|L1
JRT|Juruti Airport|Juruti|BR|S0
JSA|Jaisalmer Airport||IN|M1
JSB|Walfrido Salmito de Almeida Airport|São Benedito|BR|S0
JSH|Sitia Airport|Crete Island|GR|M1
JSI|Skiathos Island National Airport|Skiathos|GR|M1
JSJ|Jiansanjiang Shidi Airport|Jiansanjiang|CN|M1
JSK|Jask Airport|Bandar-e-Jask|IR|S1
JSM|Jose De San Martin Airport|Chubut|AR|S0
JSO|Dr. Luciano de Arruda Coelho Regional Airport|Sobral|BR|M0
JSR|Jessore Airport|Jashore (Jessore)|BD|M1
JST|John Murtha Johnstown Cambria County Airport|Johnstown|US|M1
JSU|Maniitsoq Airport|Maniitsoq|GL|S1
JSY|Syros Airport|Syros Island|GR|S1
JTA|Pedro Teixeira Castelo Airport|Tauá|BR|S0
JTC|Bauru/Arealva–Moussa Nakhal Tobias State Airport|Bauru|BR|M1
JTI|Jataí Airport|Jataí|BR|S0
JTN|Itanhaém Airport|Itanhaém|BR|S0
JTR|Santorini International Airport|Santorini Island|GR|L1
JTY|Astypalaia Airport|Astypalaia Island|GR|S1
JUA|Inácio Luís do Nascimento Airport|Juara|BR|S0
JUB|Juba International Airport|Juba|SS|L1
JUH|Chizhou Jiuhuashan Airport|Chizhou|CN|S1
JUI|Juist Airport|Juist|DE|S1
JUJ|Gobernador Horacio Guzman International Airport|San Salvador de Jujuy|AR|L1
JUL|Inca Manco Capac International Airport|Juliaca|PE|L1
JUM|Jumla Airport|Jumla|NP|S1
JUN|Jundah Airport|Jundah|AU|S0
JUO|Juradó Airport|Juradó|CO|S0
JUR|Jurien Bay Airport|Jurien Bay|AU|S0
JUT|Jutigalpa airport|Jutigalpa|HN|S0
JUV|Upernavik Airport|Upernavik|GL|S1
JUZ|Quzhou Airport|Quzhou (Kezheng)|CN|M1
JVA|Ankavandra Airport|Ankavandra|MG|S0
JVI|Central Jersey Regional Airport|Manville|US|S0
JVL|Southern Wisconsin Regional Airport|Janesville|US|S0
JWA|Jwaneng Airport|Jwaneng|BW|M0
JWN|Zanjan Airport|Zanjan|IR|M0
JWO|Jungwon Air Base/Chungju Airport|Gimseang-ro|KR|M0
JXA|Jixi Xingkaihu Airport|Jixi|CN|M1
JXN|Jackson County Airport/Reynolds Field|Jackson|US|M0
JYR|Jiroft Airport|Jiroft|IR|M0
JYV|Jyväskylä Airport|Jyväskylän Maalaiskunta|FI|M1
JZH|Jiuzhai Huanglong Airport|Ngawa (Songpan)|CN|M1
KAA|Kasama Airport|Kasama|ZM|S1
KAB|Kariba Airport|Kariba|ZW|M1
KAC|Qamishli International Airport|Qamishli|SY|M1
KAD|Kaduna International Airport|Kaduna|NG|L1
KAF|Karato Airport|Karato|PG|S0
KAG|Gangneung Airport (K-18)|Gangneung|KR|M0
KAI|Kaieteur Airport|Kaieteur Falls|GY|M1
KAJ|Kajaani Airport|Kajaani|FI|M1
KAK|Kar Airport|Kar|PG|S0
KAL|Kaltag Airport|Kaltag|US|S1
KAM|Kamaran Airport|Kamaran|YE|S0
KAN|Mallam Aminu Kano International Airport|Kano|NG|L1
KAO|Kuusamo Airport|Kuusamo|FI|M1
KAP|Kapanga Airport|Kapanga|CD|S0
KAQ|Kamulai Airport|Kamulai Mission|PG|S0
KAR|Kamarang Airport|Kamarang|GY|S0
KAS|Karasburg Airport|Karasburg|NA|S0
KAT|Kaitaia Airport|Awanui|NZ|M1
KAU|Kauhava Airfield|Kauhava|FI|M0
KAV|Kavanayen Airport|Kavanayén|VE|S0
KAW|Kawthoung Airport|Kawthoung|MM|M1
KAX|Kalbarri Airport|Kalbarri|AU|S1
KAY|Wakaya Island Airport|Wakaya Island|FJ|S0
KAZ|Kuabang Airport|Kao|ID|S0
KBA|Kabala Airport|Kabala|SL|S0
KBB|Kirkimbie Station Airport|Kirkimbie|AU|S0
KBC|Birch Creek Airport|Birch Creek|US|S1
KBD|Kimberley Downs Airport|Kimberley Downs|AU|S0
KBF|Karubaga Airport|Karubaga|ID|S0
KBH|Kahama Airstrip|Kahama|TZ|S0
KBI|Kribi Airport|Kribi|CM|S0
KBJ|Kings Canyon Airport|Petermann|AU|S0
KBK|Kushinagar International Airport|Kushinagar|IN|M0
KBL|Kabul International Airport|Kabul|AF|L1
KBM|Kabwum||PG|S0
KBN|Tunta Airport|Kabinda|CD|S0
KBO|Kabalo Airport|Kabalo|CD|S0
KBP|Boryspil International Airport|Boryspil|UA|L0
KBQ|Kasungu Airport|Kasungu|MW|S0
KBR|Sultan Ismail Petra Airport|Kota Baharu|MY|M1
KBS|Bo Airport|Bo|SL|M0
KBT|Kaben Airport|Kaben|MH|S0
KBU|Gusti Syamsir Alam Airport|Stagen|ID|S1
KBV|Krabi International Airport|Krabi|TH|L1
KBX|Kambuaya Airport|Kambuaya-Papua Island|ID|S0
KBY|Streaky Bay Airport||AU|S0
KBZ|Kaikoura Airport||NZ|S0
KCA|Kuqa Qiuci Airport|Kuqa|CN|S1
KCB|Tepoe Airstrip|Kasikasima|SR|S0
KCD|Kamur Airport|Kamur|ID|S0
KCE|Collinsville Airport||AU|S0
KCF|Thar Airport|Kandanwari|PK|S0
KCG|Chignik Airport|Chignik|US|S1
KCH|Kuching International Airport|Kuching|MY|L1
KCI|Koolan Central Airport|Koolan Island|AU|S0
KCJ|Komaio Airport|Komaio|PG|S0
KCK|Kirensk Airport|Kirensk|RU|S0
KCL|Chignik Lagoon Airport|Chignik Flats|US|S0
KCM|Kahramanmaraş Airport|Kahramanmaraş|TR|M1
KCO|Cengiz Topel Airport|Kartepe|TR|M0
KCP|Kam'yanets'-Podil's'kyi Airfield|Kamyan'ka|UA|S0
KCQ|Chignik Lake Airport|Chignik Lake|US|S1
KCR|Colorado Creek Airport|Colorado Creek|US|S0
KCS|Kings Creek Airport|Petermann|AU|S0
KCT|Koggala Airport|Galle|LK|M1
KCU|Masindi Airport|Masindi|UG|S0
KCY|Krasnoyarsk Cheremshanka Airport|Krasnoyarsk|RU|M1
KCZ|Kochi Ryoma Airport|Nankoku|JP|L1
KDA|Kolda Airport|Kolda|SN|S0
KDB|Kambalda Airport|Kambalda West|AU|S0
KDC|Kandi Airport|Kandi|BJ|S0
KDD|Khuzdar Airport|Khuzdar|PK|S1
KDE|Koroba Airport|Koroba|PG|S0
KDH|Ahmad Shah Baba International Airport|Kandahar|AF|L1
KDI|Haluoleo Airport|Kendari|ID|S1
KDJ|Ville Airport|N'Djolé|GA|S0
KDK|Kodiak Municipal Airport|Kodiak|US|S0
KDL|Kärdla Airport|Kärdla|EE|M1
KDM|Kaadedhdhoo Airport|Huvadhu Atoll|MV|M1
KDN|Ndende Airport|Ndende|GA|S0
KDO|Kadhdhoo Airport|Kadhdhoo|MV|M1
KDP|Kandep Airport|Kandep|PG|S0
KDQ|Kamberatoro Airport|Kamberatoro Mission|PG|S0
KDR|Kandrian Airport|Kandrian|PG|S0
KDS|Kamaran Downs Airport|Kamaran Downs|AU|S0
KDT|Kamphaeng Saen Airport|Nakhon Pathom|TH|M0
KDU|Skardu International Airport|Skardu|PK|L1
KDV|Vunisea Airport|Vunisea|FJ|S1
KDX|Kadugli Airport|Kadugli|SD|S0
KDY|Typliy Klyuch Airport|Khandyga|RU|S0
KEA|Kerki Airport|Kerki|TM|S0
KEB|Nanwalek Airport|Nanwalek|US|S1
KEC|Kasenga Airport|Kasenga|CD|S0
KED|Kaédi Airport|Kaédi|MR|S0
KEE|Kelle Airport|Kelle|CG|S0
KEF|Keflavik International Airport|Reykjavík|IS|L1
KEG|Keglsugl Airport|Denglagu Mission|PG|S0
KEI|Kepi Airport|Kepi|ID|S0
KEJ|Alexei Leonov Kemerovo International Airport|Kemerovo|RU|L1
KEK|Ekwok Airport|Ekwok|US|S0
KEL|Kiel-Holtenau Airport|Kiel|DE|M0
KEM|Kemi-Tornio Airport|Kemi / Tornio|FI|M1
KEN|Kenema Airport|Kenema|SL|M0
KEO|Odienne Airport|Odienne|CI|S0
KEP|Nepalgunj Airport|Nepalgunj|NP|M1
KEQ|Kebar Airport|Kebar|ID|S0
KER|Ayatollah Hashemi Rafsanjani International Airport|Kerman|IR|L1
KES|Kelsey Airport|Kelsey|CA|M0
KET|Kengtung Airport|Kengtung|MM|M1
KEU|Keekorok Airport|Keekorok|KE|S0
KEV|Halli Airport|Jämsä|FI|M0
KEW|Keewaywin Airport|Keewaywin|CA|S1
KEX|Kanabea Airport|Kanabea|PG|S0
KEY|Kericho Airport|Kericho|KE|S0
KFA|Kiffa Airport|Kiffa|MR|S0
KFE|Fortescue - Dave Forrest Aerodrome|Cloudbreak Village|AU|S0
KFG|Kalkgurung Airport||AU|S1
KFM|Kirby Lake Airport|Kirby Lake|CA|S0
KFP|False Pass Airport|False Pass|US|S1
KFS|Kastamonu Airport|Kastamonu|TR|M1
KFZ|Kukës International Airport|Kukës|AL|M0
KGA|Kananga Airport|Kananga|CD|M1
KGB|Konge Airport|Konge|PG|S0
KGC|Kingscote Airport||AU|M1
KGD|Khrabrovo Airport|Kaliningrad|RU|L1
KGE|Kaghau Airport|Kagau Island|SB|S1
KGF|Sary-Arka Airport|Karaganda|KZ|L1
KGG|Kédougou Airport|Kédougou|SN|M0
KGH|Yongai Airport|Yongai|PG|S0
KGI|Kalgoorlie Boulder Airport|Broadwood|AU|M1
KGJ|Karonga Airport|Karonga|MW|M0
KGK|Koliganek Airport|Koliganek|US|S1
KGL|Kigali International Airport|Kigali|RW|L1
KGM|Kungim Airport|Kungim|PG|S0
KGN|Kasongo-Lunda Airport|Kasongo-Lunda|CD|S0
KGO|Kirovograd Airport|Kirovograd|UA|S0
KGP|Kogalym International Airport|Kogalym|RU|M1
KGR|Kulgera Airport|Ghan|AU|S0
KGS|Kos International Airport "Ippokratis"|Kos Island|GR|L1
KGT|Kangding Airport|Garzê (Kangding)|CN|M1
KGU|Keningau Airport|Keningau|MY|S0
KGW|Kagi Airport|Kagi|PG|S0
KGX|Grayling Airport|Grayling|US|S1
KGY|Kingaroy Airport||AU|M0
KGZ|Glacier Creek Airport|Glacier Creek|US|S0
KHA|Khaneh Airport|Khaneh|IR|S0
KHC|Kerch Airport|Kerch|UA|S0
KHD|Khoram Abad Airport||IR|M1
KHE|Kherson International Airport|Kherson|UA|M0
KHG|Kashgar Laining International Airport|Kashgar|CN|L1
KHH|Kaohsiung International Airport|Kaohsiung (Xiaogang)|TW|L1
KHI|Jinnah International Airport|Karachi|PK|L1
KHJ|Kauhajoki Airfield|Kauhajoki|FI|M0
KHK|Khark Airport|Khark|IR|M1
KHM|Kanti Airport|Kanti|MM|S1
KHN|Nanchang Changbei International Airport|Nanchang|CN|L1
KHO|Khoka Moya Airport|Khoka Moya|ZA|S0
KHR|Kharkhorin Airport||MN|S0
KHS|Khasab Airport|Khasab|OM|M1
KHT|Khost International Airport|Khost|AF|M1
KHU|Kakhnovka Airfield|Kremenchuk|UA|S0
KHV|Khabarovsk Novy Airport|Khabarovsk|RU|M1
KHW|Khwai River Lodge Airport|Khwai River Lodge|BW|S0
KHX|Savannah Airstrip|Kihihi|UG|M1
KHY|Khoy Airport|Khoy|IR|S0
KHZ|Kauehi Airport|Kauehi|PF|S1
KIC|Mesa Del Rey Airport|King City|US|S0
KID|Kristianstad Airport|Kristianstad|SE|M0
KIE|Aropa Airport|Kieta|PG|S1
KIF|Kingfisher Lake Airport|Kingfisher Lake|CA|S1
KIG|Koingnaas Airport|Koingnaas|ZA|S0
KIH|Kish International Airport|Kish Island|IR|L1
KII|Kibuli Airstrip|Kibuli|PG|S0
KIJ|Niigata Airport|Niigata|JP|L1
KIK|Kirkuk International Airport|Kirkuk|IQ|L1
KIL|Kilwa Airport|Kilwa|CD|S0
KIM|Kimberley Airport|Kimberley|ZA|L1
KIN|Norman Manley International Airport|Kingston|JM|L1
KIO|Kili Airport|Kili Island|MH|S1
KIP|Kickapoo Downtown Airport|Wichita Falls|US|S0
KIQ|Kira Airport|Kira|PG|S0
KIR|Kerry Airport|Farranfore|IE|M1
KIS|Kisumu International Airport|Kisumu|KE|L1
KIT|Kithira Airport|Kithira Island|GR|S1
KIU|Kiunga Airport|Kiunga|KE|S0
KIW|Southdowns Airport|Kitwe|ZM|M0
KIX|Kansai International Airport|Osaka|JP|L1
KIY|Kilwa Airport|Kilwa Masoko|TZ|S0
KJA|Krasnoyarsk International Airport|Krasnoyarsk|RU|L1
KJB|Kurnool Airport|Orvakal|IN|M1
KJH|Kaili Huangping Airport|Kaili  (Huangping)|CN|M1
KJI|Burqin Kanas Airport|Burqin|CN|M1
KJJ|Kajjansi Airfield|Kampala|UG|S0
KJK|Kortrijk-Wevelgem International Airport|Wevelgem|BE|M0
KJP|Kerama Airport|Zamami|JP|S0
KJT|Kertajati International Airport|Kertajati|ID|M1
KJX|Kuala Batu Airport|Blangpidie|ID|S0
KKA|Koyuk Alfred Adams Airport|Koyuk|US|S1
KKC|Khon Kaen Airport|Khon Kaen|TH|M1
KKD|Kokoda Airport|Kokoda|PG|S0
KKE|Kerikeri Airport|Kerikeri|NZ|M1
KKG|Konawaruk Airport|Konawaruk|GY|S0
KKH|Kongiganak Airport|Kongiganak|US|S1
KKI|Akiachak Airport|Akiachak|US|S1
KKJ|Kitakyushu Airport|Kitakyushu|JP|L1
KKK|Kalakaket Creek AS Airport|Kalakaket Creek|US|S0
KKM|Khok Kathiam Airport|Lop Buri|TH|M0
KKN|Kirkenes Airport, Høybuktmoen|Kirkenes|NO|M1
KKO|Kaikohe Airport|Kaikohe|NZ|S0
KKP|Koolburra Airport|Koolburra|AU|S0
KKQ|Krasnoselkup Airport|Krasnoselkup|RU|S0
KKR|Kaukura Airport|Raitahiti|PF|M1
KKS|Kashan Airport|Kashan|IR|M1
KKT|Kentland Municipal Airport|Kentland|US|S0
KKU|Ekuk Airport|Ekuk|US|S0
KKW|Kikwit Airport|Kikwit|CD|M1
KKX|Kikai Airport|Kikai|JP|M1
KKY|Kilkenny Airport|Kilkenny|IE|S0
KKZ|Koh Kong Airport|Krong Khemara Phoumin|KH|S0
KLB|Kalabo Airport|Kalabo|ZM|S0
KLC|Kaolack Airport|Kaolack|SN|M0
KLD|Migalovo Air Base|Tver|RU|M0
KLE|Kaélé Airport|Kaélé|CM|S0
KLF|Grabtsevo Airport|Kaluga|RU|M0
KLG|Kalskag Airport|Kalskag|US|S1
KLH|Kolhapur Airport|Kolhapur|IN|M1
KLI|Kotakoli Airbase|Kotakoli|CD|S0
KLK|Kalokol Airport|Kalokol|KE|S0
KLL|Levelock Airport|Levelock|US|S0
KLM|Kalaleh Airport|Kalaleh|IR|S0
KLN|Larsen Bay Airport|Larsen Bay|US|S1
KLO|Kalibo International Airport|Kalibo|PH|L1
KLP|Seruyan Kuala Pembuang Airport|Seruyan|ID|S1
KLR|Kalmar Airport|Kalmar|SE|M1
KLS|Southwest Washington Regional Airport|Kelso|US|M0
KLU|Klagenfurt Airport|Klagenfurt am Wörthersee|AT|L1
KLV|Karlovy Vary Airport|Karlovy Vary|CZ|L1
KLW|Klawock Airport|Klawock|US|M1
KLX|Kalamata Airport|Kalamata|GR|M1
KLY|Kinkungwa Airport|Kalima|CD|S0
KLZ|Kleinsee Airport|Kleinsee|ZA|M0
KMA|Kerema Airport|Kerema|PG|M1
KMB|Koinambe Airport|Konambe|PG|S0
KMC|King Khaled Military City Airport|King Khaled Military City|SA|M1
KME|Kamembe Airport|Kamembe|RW|M1
KMF|Kamina Airport|Hoieti|PG|S0
KMG|Kunming Changshui International Airport|Kunming|CN|L1
KMH|Johan Pienaar Airport|Kuruman|ZA|M0
KMI|Miyazaki Airport|Miyazaki|JP|L1
KMJ|Kumamoto Airport|Kumamoto|JP|L1
KMK|Makabana Airport|Makabana|CG|S0
KML|Kamileroi Airport||AU|S0
KMM|Kimaam Airport|Kimaam|ID|S0
KMN|Kamina City Airport|Kamina|CD|S1
KMO|Manokotak Airport|Manokotak|US|S1
KMP|Keetmanshoop Airport|Keetmanshoop|NA|M0
KMQ|Komatsu Airport / JASDF Komatsu Air Base|Kanazawa|JP|L1
KMR|Karimui Airport|Karimui|PG|S0
KMS|Prempeh I International Airport|Kumasi|GH|L1
KMU|Kismayo Airport|Kismayo|SO|M0
KMV|Kalay Airport|Kalemyo|MM|S0
KMW|Kostroma Sokerkino Airport|Kostroma|RU|M1
KMX|King Khalid Air Base|Khamis Mushait|SA|M0
KMZ|Kaoma Airport|Kaoma|ZM|S0
KNA|Viña del Mar Airport|Viña del Mar|CL|M0
KNB|Kanab Municipal Airport|Kanab|US|S0
KND|Kindu Airport|Kindu|CD|M1
KNE|Kanainj Airport|Kanainj|PG|S0
KNF|RAF Marham|King's Lynn, Norfolk|GB|M0
KNG|Utarom Airport|Kaimana|ID|M1
KNH|Kinmen Airport|Shang-I|TW|M1
KNI|Katanning Airport||AU|S0
KNJ|Kindamba Airport|Kindamba|CG|S0
KNK|Kokhanok Airport|Kokhanok|US|S1
KNM|Kaniama Airport|Kaniama|CD|S0
KNN|Kankan Airport|Kankan|GN|S0
KNO|Kualanamu International Airport|Beringin|ID|L1
KNP|Kapanda Airport|Capanda|AO|S0
KNQ|Koné Airport|Koné|NC|M1
KNR|Jam Airport|Jam|IR|M0
KNS|King Island Airport||AU|M1
KNT|Kennett Memorial Airport|Kennett|US|S0
KNU|Kanpur Airport|Kanpur|IN|M1
KNW|New Stuyahok Airport|New Stuyahok|US|S1
KNX|East Kimberley Regional (Kununurra) Airport|Kununurra|AU|M1
KNY|Kodinsk Airport||RU|S0
KNZ|Kenieba Airport|Kenieba|ML|S0
KOA|Ellison Onizuka Kona International Airport at Keāhole|Kailua-Kona|US|L1
KOC|Koumac Airport|Koumac|NC|S1
KOD|Kotabangun Airport|Kotabangun-Borneo Island|ID|S0
KOE|El Tari Airport|Kupang|ID|M1
KOF|Komatipoort Airport|Komatipoort|ZA|S0
KOH|Koolatah Airport|Maramie|AU|S0
KOI|Kirkwall Airport|Kirkwall, Orkney Islands|GB|M1
KOJ|Kagoshima Airport|Kagoshima|JP|L1
KOK|Kokkola-Pietarsaari Airport|Kokkola / Kruunupyy|FI|M1
KOM|Komo-Manda Airport|Komo|PG|S0
KOO|Kongolo Airport|Kongolo|CD|S0
KOP|Nakhon Phanom Airport|Nakhon Phanom|TH|M1
KOQ|Köthen Airport|Köthen (Anhalt)|DE|S0
KOR|Kakoro(Koroko) Airstrip|Kakoro|PG|S0
KOS|Sihanouk International Airport|Preah Sihanouk|KH|L1
KOT|Kotlik Airport|Kotlik|US|S1
KOU|Koulamoutou Mabimbi Airport|Koulamoutou|GA|M0
KOV|Kokshetau International Airport|Kokshetau|KZ|L1
KOW|Ganzhou Huangjin Airport|Ganzhou|CN|S1
KOX|Kokonao Airport|Kokonao|ID|S0
KOZ|Ouzinkie Airport|Ouzinkie|US|S1
KPA|Kopiago Airport|Kopiago|PG|S0
KPC|Port Clarence Coast Guard Station|Port Clarence|US|M0
KPE|Yapsiei Airport||PG|S0
KPF|Kondobol Airport|Kondobol|PG|S0
KPI|Kapit Airport|Kapit|MY|S0
KPL|Kapal Airport|Kapal|PG|S0
KPM|Kompiam Airport||PG|S0
KPN|Kipnuk Airport|Kipnuk|US|S1
KPO|Pohang Airport (G-815/K-3)|Pohang|KR|M1
KPP|Kalpowar Airport|Kalpower|AU|S0
KPS|Kempsey Airport||AU|M0
KPT|Jackpot Airport/Hayden Field|Jackpot|US|S0
KPV|Perryville Airport|Perryville|US|S1
KPW|Keperveem Airport|Keperveem|RU|M1
KQA|Akutan Airport|Akutan|US|S1
KQH|Kishangarh Airport Ajmer|Ajmer (Kishangarh)|IN|M1
KQL|Kol Airport|Kol|PG|S0
KQR|Karara Airport|Karara|AU|S1
KQT|Bokhtar International Airport|Bokhtar|TJ|L1
KRA|Kerang Airport||AU|M0
KRB|Karumba Airport||AU|S1
KRC|Departi Parbo Airport|Sungai Penuh|ID|S1
KRD|Kurundi Airport|Kurundi Station|AU|S0
KRE|Kirundo Airport|Kirundo|BI|S1
KRF|Kramfors-Sollefteå Höga Kusten Airport|Nyland|SE|M1
KRG|Karasabai Airport|Karasabai|GY|S0
KRI|Kikori Airport|Kikori|PG|S1
KRJ|Karawari Airstrip|Amboin|PG|S0
KRK|Kraków John Paul II International Airport|Balice|PL|L1
KRL|Korla Licheng Airport|Korla|CN|M1
KRM|Karanambo Airport|Karanambo|GY|S0
KRN|Kiruna Airport|Kiruna|SE|L1
KRO|Kurgan Airport|Kurgan|RU|M1
KRP|Midtjyllands Airport / Air Base Karup|Karup|DK|M1
KRQ|Kramatorsk Airport|Kramatorsk|UA|S0
KRR|Krasnodar Pashkovsky International Airport|Krasnodar|RU|L1
KRS|Kristiansand Airport|Kristiansand(Kjevik)|NO|L1
KRT|Khartoum International Airport|Khartoum|SD|L1
KRU|Kerau Airport|Gunim|PG|S0
KRV|Kerio Valley Airport|Kimwarer|KE|S0
KRW|Turkmenbaşy International Airport|Turkmenbaşy|TM|M1
KRX|Kar Kar Airport|Kar Kar Island|PG|S0
KRY|Karamay Airport|Karamay|CN|S1
KRZ|Kiri Airport|Kiri|CD|S0
KSA|Kosrae International Airport|Okat|FM|L1
KSB|Kasonombe Airport|Kasonombe|PG|S0
KSC|Košice International Airport|Košice|SK|M1
KSD|Karlstad Airport|Karlstad|SE|M1
KSE|Kasese Airport|Kasese|UG|S0
KSF|Kassel Airport|Calden|DE|L1
KSG|Kisengam Airport [CLOSED]|Kisenden|PG|S0
KSH|Shahid Ashrafi Esfahani Airport|Kermanshah|IR|M1
KSI|Kissidougou Airport|Kissidougou|GN|S0
KSJ|Kasos Airport|Kasos Island|GR|S1
KSK|Karlskoga Airport|Karlskoga|SE|M0
KSL|Kassala Airport|Kassala|SD|M1
KSM|St Mary's Airport|St Mary's|US|S1
KSN|Kostanay International Airport|Kostanay|KZ|L1
KSO|Kastoria National Airport Aristotle|Argos Orestiko|GR|S1
KSP|Kosipe Airport|Kosipe Mission|PG|S0
KSQ|Karshi Airport|Karshi|UZ|S1
KSR|Selayar - Haji Aroeppala Airport|Benteng|ID|S1
KSS|Sikasso (Dignangan) Airport|Sikasso|ML|S0
KSU|Kristiansund Airport, Kvernberget|Kvernberget|NO|M1
KSV|Springvale Airport||AU|S0
KSW|Kiryat Shmona Airport|Kiryat Shmona|IL|S0
KSX|Yasuru Airport|Yasuru|PG|S0
KSY|Kars Airport|Kars|TR|M1
KSZ|Kotlas Airport|Kotlas|RU|M1
KTA|Karratha Airport|Karratha|AU|M1
KTC|Katiola Airport|Katiola|CI|S0
KTD|Kitadaito Airport|Kitadaitōjima|JP|M1
KTE|Kerteh Airport|Kerteh|MY|M0
KTF|Takaka Airport||NZ|S0
KTG|Rahadi Osman Airport|Ketapang|ID|M1
KTI|Techo International Airport|Phnom Penh (Boeng Khyang)|KH|L1
KTJ|Kichwa Tembo Airport|Kichwa Tembo|KE|S0
KTL|Kitale Airport|Kitale|KE|M0
KTM|Tribhuvan International Airport|Kathmandu|NP|L1
KTN|Ketchikan International Airport|Ketchikan|US|M1
KTO|Kato Airport|Kato|GY|S0
KTP|Tinson Pen Airport|Tinson Pen|JM|M1
KTQ|Kitee Airport|Kitee|FI|M0
KTR|Tindal Airport||AU|M0
KTS|Brevig Mission Airport|Brevig Mission|US|S1
KTT|Kittilä International Airport|Kittilä|FI|L1
KTU|Kota Airport|Kota|IN|M0
KTV|Kamarata Airport|Kamarata|VE|S0
KTW|Katowice Wojciech Korfanty International Airport|Katowice|PL|L1
KTY|Katukurunda Air Force Base|Kalutara|LK|S0
KUA|Kuantan Airport|Kuantan|MY|M1
KUB|Anduki Airport|Seria|BN|S0
KUC|Kuria Airport|Kuria|KI|S0
KUD|Kudat Airport|Kudat|MY|S1
KUE|Kukudu Airport|Kolombangara Island|SB|S0
KUF|Kurumoch International Airport|Samara|RU|L1
KUG|Kubin Island Airport|Kubin Island|AU|S1
KUH|Kushiro Airport|Kushiro|JP|M1
KUK|Kasigluk Airport|Kasigluk|US|S1
KUL|Kuala Lumpur International Airport|Sepang|MY|L1
KUM|Yakushima Airport|Yakushima|JP|M1
KUN|Kaunas International Airport|Kaunas|LT|L1
KUO|Kuopio Airport|Kuopio / Siilinjärvi|FI|L1
KUP|Kupiano Airport|Kupiano|PG|S0
KUQ|Kuri Airport|Kuri|PG|S0
KUR|Razer Airport|Skazar|AF|S0
KUS|Kulusuk Airport|Kulusuk|GL|M1
KUT|David the Builder Kutaisi International Airport|Kopitnari|GE|L1
KUU|Kullu Manali Airport|Bhuntar|IN|M1
KUV|Gunsan Airport / Gunsan Air Base|Gunsan|KR|M1
KUX|Kuyol Airport||PG|S0
KUY|Kamusi Airport|Kamusi|PG|S0
KVA|Kavala Alexander the Great International Airport|Kavala|GR|L1
KVB|Skövde Airport|Skövde|SE|M0
KVC|King Cove Airport|King Cove|US|S1
KVE|Kitava Airport|Kitava Island|PG|S0
KVG|Kavieng Airport|Kavieng|PG|M1
KVK|Kirovsk-Apatity Airport|Apatity|RU|S1
KVL|Kivalina Airport|Kivalina|US|S1
KVM|Markovo Airport|Markovo|RU|S1
KVO|Morava Airport|Kraljevo|RS|M1
KVR|Kavalerovo Airport|Kavalerovo|RU|S0
KVX|Pobedilovo Airport|Kirov|RU|M1
KWA|Bucholz Army Air Field|Kwajalein|MH|M1
KWB|Dewadaru Airport|Karimunjawa|ID|S1
KWD|Kavadja Airport|Kavadja|CF|S0
KWE|Guiyang Longdongbao International Airport|Guiyang (Nanming)|CN|L1
KWG|Kryvyi Rih International Airport|Kryvyi Rih|UA|M0
KWH|Khwahan Airport|Khwahan|AF|S0
KWI|Kuwait International Airport|Kuwait City|KW|L1
KWJ|Gwangju Airport|Gwangju|KR|M1
KWK|Kwigillingok Airport|Kwigillingok|US|S1
KWL|Guilin Liangjiang International Airport|Guilin (Lingui)|CN|L1
KWM|Kowanyama Airport|Kowanyama|AU|M1
KWN|Quinhagak Airport|Quinhagak|US|S1
KWO|Kawito Airport|Kawito|PG|S0
KWS|Kwailabesi Airport|Kwailabesi|SB|S0
KWT|Kwethluk Airport|Kwethluk|US|S1
KWY|Kiwayu Airport|Kiwayu|KE|M0
KWZ|Kolwezi Airport|Kolwezi|CD|M1
KXB|Sangia Nibandera Airport|Kolaka|ID|M1
KXD|Kondinskoye Airport|Kondinskoye|RU|S0
KXE|P C Pelser Airport|Klerksdorp|ZA|M0
KXF|Koro Island Airport|Koro Island|FJ|S1
KXK|Komsomolsk-on-Amur Airport|Komsomolsk-on-Amur|RU|M1
KXO|Kisoro Airport|Kisoro|UG|S1
KXU|Katiu Airport|Katiu|PF|S0
KYA|Konya Airport|Konya|TR|L1
KYB|Ken's Bore airport|Ken's Bore|AU|S0
KYD|Lanyu Airport|Orchid Island|TW|M1
KYE|Rene Mouawad Air Base|Tripoli|LB|M0
KYF|Yeelirrie Airport||AU|S0
KYI|Yalata Mission Airport|Yalata Mission|AU|S0
KYK|Karluk Airport|Karluk|US|S1
KYO|Tampa North Aero Park Airport|Tampa|US|S0
KYP|Kyaukpyu Airport|Kyaukpyu|MM|M1
KYS|Kayes Dag Dag Airport|Kayes|ML|M1
KYT|Kyauktu Airport|Kyauktu|MM|S0
KYU|Koyukuk Airport|Koyukuk|US|S1
KYX|Yalumet Airport|Yalumet|PG|S0
KYZ|Kyzyl Airport|Kyzyl|RU|M1
KZD|Krakor Airport|Krakor|KH|S0
KZF|Kaintiba Airport|Kaintiba|PG|S0
KZG|Kitzingen Airfield|Kitzingen|DE|S0
KZI|Kozani National Airport Filippos|Kozani|GR|M1
KZN|Kazan International Airport|Kazan|RU|L1
KZO|Korkyt Ata International Airport|Kyzylorda|KZ|L1
KZR|Zafer Airport|Altıntaş|TR|M1
KZS|Kastelorizo Airport|Kastelorizo Island|GR|S1
LAA|Southeast Colorado Regional Airport|Lamar|US|M0
LAB|Lab Lab Airport|Lab Lab Mission|PG|S0
LAC|Layang-Layang Airport|Pulau Layang-Layang (Swallow Reef)|MY|S0
LAD|Quatro de Fevereiro International Airport|Luanda|AO|L1
LAE|Nadzab Tomodachi International Airport|Lae|PG|L1
LAF|Purdue University Airport|West Lafayette|US|M1
LAH|Oesman Sadik Airport|Labuha-Halmahera Island|ID|S0
LAI|Lannion Airport|Lannion|FR|M0
LAJ|Lages Airport|Lages|BR|M1
LAK|Aklavik/Freddie Carmichael Airport|Aklavik|CA|S1
LAL|Lakeland Linder International Airport|Lakeland|US|M1
LAM|Los Alamos Airport|Los Alamos|US|S0
LAN|Capital Region International Airport|Lansing|US|M1
LAO|Laoag International Airport|Laoag City|PH|L1
LAP|Manuel Márquez de León International Airport|La Paz|MX|M1
LAQ|Al Abraq International Airport|Al Albraq|LY|L1
LAR|Laramie Regional Airport|Laramie|US|M1
LAS|Harry Reid International Airport|Las Vegas|US|L1
LAU|Manda Airport|Lamu|KE|M1
LAW|Lawton Fort Sill Regional Airport|Lawton|US|M1
LAX|Los Angeles International Airport|Los Angeles|US|L1
LAY|Ladysmith Airport|Ladysmith|ZA|M0
LAZ|Bom Jesus da Lapa Airport|Bom Jesus da Lapa|BR|M0
LBA|Leeds Bradford Airport|Leeds, West Yorkshire|GB|L1
LBB|Lubbock Preston Smith International Airport|Lubbock|US|M1
LBC|Lübeck Blankensee Airport|Lübeck|DE|M1
LBD|Khujand International Airport|Khujand|TJ|L1
LBE|Arnold Palmer Regional Airport|Latrobe|US|M1
LBF|North Platte Regional Airport Lee Bird Field|North Platte|US|M1
LBG|Paris-Le Bourget International Airport|Paris|FR|L0
LBI|Albi Le Sequestre airport|Albi|FR|M0
LBJ|Komodo Airport|Labuan Bajo, Manggarai Barat|ID|S1
LBK|Liboi Airport|Liboi|KE|S0
LBL|Liberal Mid-America Regional Airport|Liberal|US|M1
LBM|Luabo Airport|Luabo|MZ|S0
LBN|Lake Baringo (Kampi Ya Samaki) Airport|Akorian|KE|S0
LBO|Lusambo Airport|Lusambo|CD|S0
LBP|Long Banga Airport|Long Banga|MY|S1
LBQ|Lambarene Airport|Lambarene|GA|M0
LBR|Lábrea Airport|Lábrea|BR|S1
LBS|Labasa Airport|Labasa|FJ|M1
LBT|Lumberton Regional Airport|Lumberton|US|M0
LBU|Labuan Airport|Labuan|MY|M1
LBV|Libreville Leon M'ba International Airport|Libreville|GA|L1
LBW|Yuvai Semaring Airport|Long Bawan|ID|S1
LBX|Lubang Airport|Lubang|PH|M0
LBY|La Baule-Escoublac Airport|La Baule-Escoublac|FR|M0
LBZ|Lucapa Airport|Lucapa|AO|S0
LCA|Larnaca International Airport|Larnaca|CY|L1
LCB|André Antônio Maggi Airport|Pontes e Lacerda|BR|S0
LCC|Lecce Galatina Air Base / Galatina Fortunato Cesari Airport|Galatina (LE)|IT|M0
LCD|Louis Trichardt Airport|Louis Trichardt|ZA|S0
LCE|Golosón International Airport|La Ceiba|HN|M1
LCF|Las Vegas Airport|Rio Dulce|GT|S0
LCG|A Coruña Airport|Culleredo|ES|M1
LCH|Lake Charles Regional Airport|Lake Charles|US|M1
LCI|Laconia Municipal Airport|Laconia / Gilford|US|S0
LCJ|Łódź Władysław Reymont Airport|Łódź|PL|L1
LCK|Rickenbacker International Airport|Columbus|US|M1
LCM|La Cumbre Airport|La Cumbre|AR|S0
LCN|Balcanoona Airport||AU|S0
LCO|Lague Airport|Lague|CG|S0
LCP|Loncopue Airport|Loncopue|AR|S0
LCQ|Lake City Gateway Airport|Lake City|US|S0
LCR|Virgilio Barco Vargas (La Chorrera) Airport|La Chorrera|CO|S1
LCS|Longchuan Guangsong Airport|Dehong (Longchuan)|CN|S0
LCT|Shijiazhuang Luancheng Airport|Shijiazhuang|CN|S0
LCX|Liancheng Guanzhishan Airport|Longyan (Liancheng)|CN|M1
LCY|London City Airport|London|GB|M1
LDA|Malda Airport|Malda|IN|S0
LDB|Governor José Richa Airport|Londrina|BR|M1
LDC|Lindeman Island Airport|Lindeman Island|AU|S0
LDE|Tarbes-Lourdes-Pyrénées Airport|Tarbes/Lourdes/Pyrénées|FR|M1
LDG|Leshukonskoye Airport|Leshukonskoye|RU|S1
LDH|Lord Howe Island Airport|Lord Howe Island|AU|S1
LDI|Lindi Airport|Lindi|TZ|S0
LDJ|Linden Airport|Linden|US|S0
LDK|Lidköping-Hovby Airport|Lidköping|SE|S0
LDM|Mason County Airport|Ludington|US|S0
LDN|Lamidanda Airport|Lamidanda|NP|S0
LDO|Ladouanie Airport|Aurora|SR|S0
LDS|Yichun Lindu Airport|Yichun|CN|M1
LDU|Lahad Datu Airport|Lahad Datu|MY|M1
LDV|Landivisiau Air Base|Landivisiau|FR|M0
LDW|Lansdowne Airport|Lansdowne Station|AU|S0
LDX|Saint-Laurent-du-Maroni Airport|Saint-Laurent-du-Maroni|GF|M1
LDY|City of Derry Airport|Derry, Derry and Strabane|GB|M1
LDZ|Londolozi Airport|Londolozi|ZA|S0
LEA|Learmonth Airport|Exmouth|AU|M1
LEB|Lebanon Municipal Airport|Lebanon|US|M1
LEC|Coronel Horácio de Mattos Airport|Lençóis|BR|S1
LED|Pulkovo Airport|St. Petersburg|RU|L1
LEE|Leesburg International Airport|Leesburg|US|M0
LEF|Lebakeng Airport|Lebakeng|LS|S0
LEH|Le Havre-Octeville Airport|Le Havre|FR|M0
LEI|Almería Airport|Almería|ES|M1
LEJ|Leipzig/Halle Airport|Schkeuditz|DE|L1
LEK|Tata Airport|Labé|GN|S0
LEL|Lake Evella Airport||AU|S1
LEM|Lemmon Municipal Airport|Lemmon|US|S0
LEN|León Airport|La Virgen del Camino|ES|M1
LEO|Lekoni Airport|Lekoni|GA|S0
LEP|Leopoldina Airport|Leopoldina|BR|S0
LEQ|Land's End Airport|Land's End, Cornwall|GB|S1
LER|Leinster Airport||AU|M1
LES|Lesobeng Airport|Lesobeng|LS|S0
LET|Alfredo Vásquez Cobo International Airport|Leticia|CO|M1
LEU|Pirineus - la Seu d'Urgel Airport|La Seu d'Urgell Pyrenees and Andorra|ES|M1
LEV|Levuka Airfield|Bureta|FJ|S1
LEW|Auburn Lewiston Municipal Airport|Auburn/Lewiston|US|S0
LEX|Blue Grass Airport|Lexington|US|M1
LEY|Lelystad Airport|Lelystad|NL|M0
LEZ|La Esperanza Airport|La Esperanza|HN|S0
LFB|Lumbo Airport|Lumbo|MZ|S0
LFH|Lanping Fenghua General Airport|Lanping Bai|CN|S0
LFI|Langley Air Force Base|Hampton|US|M0
LFK|Angelina County Airport|Lufkin|US|M0
LFM|Lamerd Airport|Lamerd|IR|M1
LFN|Triangle North Executive Airport|Louisburg|US|S0
LFO|Kelafo East Airport|Kelafo|ET|S0
LFP|Lakefield Airport|Lakefield|AU|S0
LFQ|Linfen Yaodu Airport|Linfen (Yaodu)|CN|M1
LFR|La Fria Airport||VE|M0
LFT|Lafayette Regional Airport|Lafayette|US|M1
LFW|Lomé–Tokoin International Airport|Lomé|TG|L1
LGA|LaGuardia Airport|New York|US|L1
LGB|Long Beach International Airport|Long Beach|US|L1
LGC|LaGrange Callaway Airport|LaGrange|US|S0
LGD|La Grande/Union County Airport|La Grande|US|S0
LGE|Mulan Airport|Lake Gregory|AU|S0
LGF|Laguna Army Airfield|Yuma Proving Ground(Yuma)|US|S0
LGG|Liège Airport|Grâce-Hollogne|BE|M1
LGH|Leigh Creek Airport||AU|M0
LGI|Deadman's Cay Airport|Deadman's Cay|BS|M1
LGK|Langkawi International Airport|Langkawi|MY|L1
LGL|Long Lellang Airport|Long Datih|MY|S1
LGN|Linga Linga Airport|Linga Linga|PG|S0
LGO|Langeoog Airport|Langeoog|DE|S0
LGQ|Nueva Loja Airport|Lago Agrio|EC|S0
LGR|Cochrane Airport|Cochrane|CL|M0
LGS|Comodoro D.R. Salomón Airport|Malargue|AR|M0
LGT|La Gaviota Airport||CO|S0
LGU|Logan-Cache Airport|Logan|US|M0
LGW|London Gatwick Airport|London|GB|L1
LGX|Lugh Ganane Airport|Luuq|SO|S0
LGZ|Shannan Longzi Airport|Shannan|CN|S1
LHA|Lahr Airport|Lahr/Schwarzwald|DE|M0
LHE|Allama Iqbal International Airport|Lahore|PK|L1
LHG|Lightning Ridge Airport||AU|M1
LHI|Lereh Airport|Lereh-Papua Island|ID|S0
LHK|Guangzhou MR Air Base / Guanghua Airport|Xiangyang (Laohekou)|CN|M0
LHL|Lachin International Airport|Lachin|AZ|M1
LHN|Linhares Municipal Airport|Linhares|BR|M0
LHR|London Heathrow Airport|London|GB|L1
LHS|Las Heras Airport|Las Heras|AR|M1
LHU|Lianshulu Lodge Airstrip|Muneambuanas|NA|S0
LHV|William T. Piper Memorial Airport|Lock Haven|US|S0
LHW|Lanzhou Zhongchuan International Airport|Lanzhou (Yongdeng)|CN|L1
LIA|Liangping Airport|Liangping|CN|S0
LIB|Limbunya Airport|Limbunya|AU|S0
LIC|Limon Municipal Airport|Limon|US|S0
LIE|Libenge Airport|Libenge|CD|S0
LIF|Lifou Airport|Lifou|NC|M1
LIG|Limoges Airport|Limoges/Bellegarde|FR|M1
LIH|Lihue Airport|Lihue, Kauai|US|L1
LII|Mulia Airport|Mulia-Papua Island|ID|S0
LIJ|Lishui Airport|Lishui (Liandu)|CN|S0
LIK|Likiep Airport|Likiep Island|MH|S1
LIL|Lille Airport|Lesquin|FR|L1
LIM|Jorge Chávez International Airport|Lima|PE|L1
LIN|Milano Linate Airport|Segrate (MI)|IT|L1
LIO|Limón International Airport|Limón|CR|M1
LIP|Lins Airport|Lins|BR|M0
LIQ|Lisala Airport|Lisala|CD|M0
LIR|Daniel Oduber Quirós International Airport|Liberia|CR|L1
LIS|Lisbon Humberto Delgado Airport|Lisbon|PT|L1
LIT|Bill & Hillary Clinton National Airport/Adams Field|Little Rock|US|M1
LIV|Livengood Camp Airport|Livengood|US|S0
LIW|Loikaw Airport|Loikaw|MM|M1
LIX|Likoma Island Airport|Likoma Island|MW|S0
LIY|MidCoast Regional Airport at Wright Army Airfield|Hinesville|US|S0
LIZ|Loring International Airport|Limestone|US|S0
LJA|Lodja Airport|Lodja|CD|S0
LJG|Lijiang Sanyi International Airport|Lijiang|CN|L1
LJN|Texas Gulf Coast Regional Airport|Angleton|US|M0
LJU|Ljubljana Jože Pučnik Airport|Zgornji Brnik|SI|L1
LKA|Larantuka Gewayentana Airport|Tiwatobi|ID|S1
LKB|Lakeba Island Airport|Lakeba Island|FJ|S1
LKC|Lekana Airport|Lekana|CG|S0
LKD|Lakeland Airport|Lakeland Downs|AU|S0
LKG|Lokichogio Airport|Lokichogio|KE|M0
LKH|Long Akah Airport|Long Akah|MY|S0
LKI|Lasikin Airport|Lubang|ID|S1
LKK|Kulik Lake Airport|Kulik Lake|US|S0
LKL|Lakselv Airport, Banak|Lakselv|NO|M1
LKM|Bolaang Mongondow Airport|Lolak|ID|S1
LKN|Leknes Airport|Leknes|NO|M1
LKO|Chaudhary Charan Singh International Airport|Lucknow|IN|L1
LKP|Lake Placid Airport|Lake Placid|US|S0
LKR|Las Khorey Airport|Las Khorey|SO|S0
LKV|Lake County Airport|Lakeview|US|S0
LKW|Lekhwair Airport|Lekhwair|OM|S0
LKY|Lake Manyara Airport|Lake Manyara National Park|TZ|M0
LKZ|RAF Lakenheath|Brandon, Suffolk|GB|M0
LLA|Luleå Airport|Luleå|SE|L1
LLB|Libo Airport|Qiannan (Libo)|CN|S1
LLC|Cagayan North International Airport|Lal-lo|PH|M0
LLE|Malelane Airport|Malelane|ZA|S0
LLF|Yongzhou Lingling Airport|Yongzhou|CN|M1
LLG|Chillagoe Airport|Chillagoe|AU|S0
LLH|La Lima - Reginaldo Hammer Airport|La Lima|HN|S0
LLI|Lalibela Airport|Girany Amba|ET|S0
LLJ|Silampari Airport|Lubuk Linggau|ID|S0
LLK|Lankaran International Airport|Lankaran|AZ|S1
LLL|Lissadell Airport|Lissadell Station|AU|S0
LLM|Lomlom Airport|Lomlom|SB|S0
LLN|Kelila Airport|Kelila|ID|S0
LLO|Bua - Palopo Lagaligo Airport|Palopo|ID|S1
LLS|Alferez Armando Rodriguez Airport|Las Lomitas|AR|S0
LLT|Lobito Airport|Lobito|AO|S0
LLV|Lüliang Dawu Airport|Lüliang|CN|M1
LLW|Kamuzu International Airport|Lumbadzi|MW|L1
LLX|Caledonia County Airport|Lyndonville|US|S0
LLY|South Jersey Regional Airport|Lumberton|US|S0
LMA|Minchumina Airport|Minchumina|US|S1
LMB|Salima Airport|Salima|MW|S0
LMC|La Macarena Airport|La Macarena|CO|S1
LMD|Los Menucos Airport|Los Menucos|AR|S0
LME|Le Mans-Arnage Airport|Le Mans, Sarthe|FR|M0
LMH|Limon Airport|Limón|HN|S0
LMI|Lumi Airport|Lumi|PG|S0
LML|Lae Island Airport|Lae Island|MH|S0
LMM|Valle del Fuerte International Airport|Los Mochis|MX|M1
LMN|Limbang Airport|Limbang|MY|M1
LMO|RAF Lossiemouth|Lossiemouth, Moray|GB|M0
LMP|Lampedusa Airport|Lampedusa|IT|M1
LMQ|Marsa al Brega Airport|Marsa al Brega|LY|M0
LMR|Lime Acres Finsch Mine Airport|Lime Acres|ZA|M0
LMS|Louisville Winston County Airport|Louisville|US|S0
LMT|Crater Lake-Klamath Regional Airport|Klamath Falls|US|M0
LMU|Letung Airport|Bukit Padi|ID|S0
LMV|Madivaru Airport|Naifaru|MV|S0
LMX|Lopez de Micay Airport|Micay|CO|S0
LMY|Lake Murray Airport|Lake Murray|PG|S1
LMZ|Palma Airport|Palma|MZ|S0
LNA|Palm Beach County Park Airport|West Palm Beach|US|S0
LNB|Lamen Bay Airport|Lamen Bay|VU|S1
LNC|Lengbati Airport||PG|S0
LND|Hunt Field|Lander|US|M0
LNE|Lonorore Airport|Lonorore|VU|S1
LNF|Munbil Airport||PG|S0
LNG|Lese Airport|Lese|PG|S0
LNH|Lake Nash Airport|Alpurrurulam|AU|S0
LNI|Point Lonely Short Range Radar Site Airfield|Point Lonely|US|S0
LNJ|Lincang Boshang Airport|Lincang|CN|M1
LNK|Lincoln Airport|Lincoln|US|M1
LNL|Longnan Chengzhou Airport|Longnan (Cheng)|CN|M1
LNM|Langimar Airport||PG|S0
LNN|Lake County Executive Airport|Willoughby|US|S0
LNO|Leonora Airport|Leonora|AU|M1
LNP|Lonesome Pine Airport|Wise|US|S0
LNR|Tri-County Regional Airport|Spring Green|US|S0
LNS|Lancaster Airport|Lancaster|US|M1
LNU|Robert Atty Bessing|Malinau|ID|S1
LNV|Londolovit Airport|Londolovit|PG|S1
LNX|Smolensk North Airport|Smolensk|RU|M0
LNY|Lanai Airport|Lanai City|US|M1
LNZ|Linz-Hörsching Airport|Linz|AT|L1
LOA|Lorraine Airport||AU|S0
LOB|San Rafael Airport|Los Andes|CL|S0
LOC|Lock Airport|Lock|AU|S0
LOD|Longana Airport|Longana|VU|S1
LOE|Loei Airport||TH|M1
LOH|Ciudad de Catamayo Airport|La Toma (Catamayo)|EC|S1
LOI|Helmuth Baungarten Airport|Lontras|BR|S0
LOK|Lodwar Airport|Lodwar|KE|M0
LOL|Derby Field|Lovelock|US|M0
LOM|Francisco Primo de Verdad y Ramos Airport|Lagos de Moreno|MX|S0
LOO|Laghouat - Molay Ahmed Medeghri Airport|Laghouat|DZ|M1
LOP|Lombok International Airport|Mataram (Pujut, Lombok Tengah)|ID|L1
LOS|Murtala Muhammed International Airport|Lagos|NG|L1
LOT|Lewis University Airport|Chicago/Romeoville|US|S0
LOU|Bowman Field|Louisville|US|M0
LOV|Monclova International Airport|Monclova|MX|M0
LOW|Louisa County Airport / Freeman Field|Louisa|US|S0
LOY|Loiyangalani Airport|Loiyangalani|KE|S0
LOZ|London-Corbin Airport/Magee Field|London|US|M0
LPA|Gran Canaria Airport|Gran Canaria Island|ES|L1
LPB|El Alto International Airport|La Paz / El Alto|BO|L1
LPC|Lompoc Airport|Lompoc|US|S0
LPD|La Pedrera Airport|La Pedrera|CO|S1
LPE|La Primavera Airport|La Primavera|CO|S0
LPF|Liupanshui Yuezhao Airport|Liupanshui (Zhongshan)|CN|M1
LPG|La Plata Airport|La Plata|AR|M0
LPI|Linköping City Airport|Linköping|SE|L1
LPJ|Armando Schwarck Airport|Guayabal|VE|S0
LPK|Lipetsk Airport|Lipetsk|RU|M0
LPL|Liverpool John Lennon Airport|Liverpool|GB|L1
LPM|Lamap Airport|Lamap|VU|S1
LPN|Leron Plains Airport|Leron Plains|PG|S0
LPO|La Porte Municipal Airport|La Porte|US|S0
LPP|Lappeenranta Airport|Lappeenranta|FI|L1
LPQ|Luang Phabang International Airport|Luang Phabang|LA|L1
LPS|Lopez Island Airport|Lopez|US|S1
LPT|Lampang Airport||TH|M1
LPU|Long Apung Airport|Long Apung-Borneo Island|ID|S1
LPX|Liepāja International Airport|Liepāja|LV|L0
LPY|Le Puy-Loudes Airfield|Chaspuzac, Haute-Loire|FR|S1
LQK|Pickens County Airport|Pickens|US|S0
LQM|Caucaya Airport|Puerto Leguízamo|CO|S1
LQN|Qala-i-Naw Airport|Qala-i-Naw|AF|S0
LRA|Larissa Air Base|Larissa|GR|S0
LRB|Leribe Airport|Leribe|LS|S0
LRD|Laredo International Airport|Laredo|US|M1
LRE|Longreach Airport|Longreach|AU|M1
LRF|Little Rock Air Force Base|Jacksonville|US|M0
LRG|Loralai Airport|Loralai|PK|S0
LRH|La Rochelle Île de Ré Airport|La Rochelle|FR|M1
LRJ|Le Mars Municipal Airport|Le Mars|US|S0
LRL|Niamtougou International Airport|Niamtougou|TG|L0
LRM|Casa De Campo International Airport|La Romana|DO|L1
LRQ|Laurie River Airport|Laurie River|CA|S0
LRR|Lar Airport|Lar|IR|M1
LRS|Leros Airport|Leros Island|GR|S1
LRT|Lorient South Brittany (Bretagne Sud) Airport|Lorient/Lann/Bihoué|FR|M0
LRU|Las Cruces International Airport|Las Cruces|US|M1
LRV|Los Roques Airport|Gran Roque Island|VE|S1
LSA|Losuia Airport|Losuia|PG|S1
LSB|Lordsburg Municipal Airport|Lordsburg|US|S0
LSC|La Florida Airport|La Serena-Coquimbo|CL|M1
LSE|La Crosse Regional Airport|La Crosse|US|M1
LSF|Lawson Army Air Field|Fort Benning|US|M0
LSG|Leshan Airport|Leshan (Wutongqiao)|CN|M1
LSH|Lashio Airport|Lashio|MM|M1
LSI|Sumburgh Airport|Lerwick, Shetland|GB|M1
LSJ|Long Island Airport|Long Island|PG|S0
LSK|Lusk Municipal Airport|Lusk|US|S0
LSL|Los Chiles Airport|Los Chiles|CR|M0
LSM|Long Semado Airport|Long Semado|MY|S0
LSN|Los Banos Municipal Airport|Los Banos|US|S0
LSO|Les Sables-d'Olonne Talmont Airport|Les Sables-d'Olonne|FR|S0
LSP|Josefa Camejo International Airport|Paraguaná|VE|M1
LSQ|María Dolores Airport|Los Angeles|CL|S0
LSR|Alas Leuser Airport|Kutacane|ID|M1
LSS|Terre-de-Haut Airport|Les Saintes|GP|S0
LST|Launceston Airport|Launceston (Western Junction)|AU|M1
LSU|Long Sukang Airport|Long Sukang|MY|S0
LSV|Nellis Air Force Base|Las Vegas|US|M0
LSW|Malikus Saleh Airport|Lhok Seumawe-Sumatra Island|ID|S1
LSX|Lhok Sukon Airport|Lhok Sukon-Sumatra Island|ID|M0
LSY|Lismore Airport|Lismore|AU|M1
LSZ|Lošinj Airport|Mali Lošinj|HR|S0
LTA|Tzaneen Airport|Tzaneen|ZA|M0
LTC|Lai Airport|Lai|TD|S0
LTD|Ghadames Airport|Ghadames|LY|M1
LTF|Leitre Airport|Leitre|PG|S0
LTG|Langtang Airport|Langtang|NP|S0
LTH|Long Thanh International Airport (Under Construction)|Ho Chi Minh City (Long Thanh)|VN|L0
LTI|Altai Airport|Altai|MN|M1
LTK|Latakia International Airport|Latakia|SY|M1
LTL|Lastourville Airport|Lastourville|GA|S0
LTM|Lethem Airport|Lethem|GY|M1
LTN|London Luton Airport|Luton, Luton|GB|L1
LTO|Loreto International Airport|Loreto|MX|L1
LTP|Lyndhurst Airport|Lyndhurst|AU|S0
LTQ|Le Touquet-Côte d'Opale Airport|Le Touquet-Paris-Plage|FR|M0
LTS|Altus Air Force Base|Altus|US|M0
LTT|La Môle Airport|Saint-Tropez|FR|S1
LTU|Murod Kond Airport|Latur|IN|M1
LTV|Lotus Vale Airport|Lotus Vale|AU|S0
LTW|St. Mary's County Regional Airport|California|US|S0
LTX|Cotopaxi International Airport|Latacunga|EC|M1
LUA|Tenzing-Hillary Airport|Lukla|NP|M1
LUB|Lumid Pau Airport|Lumid Pau|GY|S0
LUC|Laucala Island Airport|Laucala Island|FJ|S0
LUD|Luderitz Airport|Luderitz|NA|M1
LUE|Lučenec Airfield|Lučenec|SK|S0
LUF|Luke Air Force Base|Glendale|US|M0
LUG|Lugano Airport|Agno|CH|M1
LUH|Ludhiana Airport||IN|M0
LUI|Carta Airport|La Unión|HN|S0
LUK|Cincinnati Municipal Airport Lunken Field|Cincinnati|US|M1
LUL|Hesler Noble Field|Laurel|US|S0
LUM|Dehong Mangshi International Airport|Dehong (Mangshi)|CN|M1
LUN|Kenneth Kaunda International Airport|Lusaka|ZM|L1
LUO|Luena Airport|Luena|AO|M0
LUP|Kalaupapa Airport|Kalaupapa|US|S1
LUQ|Brigadier Mayor D Cesar Raul Ojeda Airport|San Luis|AR|M1
LUR|Cape Lisburne LRRS Airport|Cape Lisburne|US|M1
LUT|New Laura Airport|Laura Station|AU|S0
LUU|Laura Airport||AU|S0
LUV|Karel Sadsuitubun Airport|Langgur|ID|M1
LUW|Syukuran Aminuddin Amir Airport|Luwok|ID|M0
LUX|Luxembourg-Findel International Airport|Luxembourg|LU|L1
LUZ|Lublin Airport|Lublin|PL|L1
LVA|Laval-Entrammes Airport|Laval, Mayenne|FR|M0
LVD|Lime Village Airport|Lime Village|US|S0
LVI|Harry Mwanga Nkumbula International Airport|Livingstone|ZM|L1
LVK|Livermore Municipal Airport|Livermore|US|S0
LVL|Brunswick Municipal Airport|Lawrenceville|US|S0
LVM|Mission Field|Livingston|US|M0
LVO|Laverton Airport|Laverton|AU|S1
LVP|Lavan Airport|Lavan Airport|IR|M0
LVR|Municipal Bom Futuro Airport|Lucas do Rio Verde|BR|S0
LVS|Las Vegas Municipal Airport|Las Vegas|US|M0
LWA|Lebak Rural Airport|Lebak|PH|S0
LWB|Greenbrier Valley Airport|Lewisburg|US|M1
LWC|Lawrence Municipal Airport|Lawrence|US|S0
LWE|Wonopito Airport|Lewoleba|ID|S0
LWH|Lawn Hill Airport||AU|S0
LWI|Lowai Airport|Lowai|PG|S0
LWK|Lerwick / Tingwall Airport|Lerwick, Shetland Islands|GB|S1
LWL|Wells Municipal Airport/Harriet Field|Wells|US|S0
LWM|Lawrence Municipal Airport|Lawrence|US|M0
LWN|Shirak International Airport|Gyumri|AM|L1
LWO|Lviv International Airport|Lviv|UA|L0
LWR|Leeuwarden Air Base|Leeuwarden|NL|M0
LWS|Lewiston Nez Perce County Airport|Lewiston|US|M1
LWT|Lewistown Municipal Airport|Lewistown|US|M0
LWV|Lawrenceville Vincennes International Airport|Lawrenceville|US|S0
LWY|Lawas Airport|Lawas|MY|S1
LXA|Lhasa Gonggar International Airport|Shannan (Gonggar)|CN|L1
LXG|Luang Namtha Airport|Luang Namtha|LA|S1
LXN|Jim Kelly Field|Lexington|US|S0
LXR|Luxor International Airport|Luxor|EG|L1
LXS|Limnos Airport|Limnos Island|GR|S1
LXU|Lukulu Airport|Lukulu|ZM|S0
LXV|Lake County Airport|Leadville|US|S0
LYA|Luoyang Beijiao Airport|Luoyang (Laocheng)|CN|L1
LYB|Edward Bodden Little Cayman Airfield|Blossom Village|KY|M0
LYC|Lycksele Airport|Lycksele|SE|M1
LYG|Lianyungang Huaguoshan International Airport|Lianyungang|CN|L1
LYH|Lynchburg Regional Airport - Preston Glenn Field|Lynchburg|US|M1
LYI|Linyi Qiyang Airport|Linyi (Hedong)|CN|M1
LYK|Lunyuk Airport|Lunyuk|ID|S0
LYN|Lyon Bron Airport|Chassieu, Lyon|FR|M0
LYO|Lyons-Rice County Municipal Airport|Lyons|US|S0
LYP|Faisalabad International Airport|Faisalabad|PK|L1
LYR|Svalbard Airport, Longyear|Longyearbyen|NO|M1
LYS|Lyon Saint-Exupéry Airport|Colombier-Saugnieu, Rhône|FR|L1
LYT|Lady Elliot Island Airstrip|Lady Elliot Island|AU|S0
LYU|Ely Municipal Airport|Ely|US|M0
LYX|Lydd London Ashford Airport|Romney Marsh, Kent|GB|M0
LZA|Luiza Airport|Luiza|CD|S0
LZC|Lázaro Cárdenas Airport|Lázaro Cárdenas|MX|M0
LZG|Langzhong Gucheng Airport|Nanchong (Langzhong)|CN|M1
LZH|Liuzhou Bailian Airport / Bailian Air Base|Liuzhou (Liujiang)|CN|M1
LZI|Luozi Airport|Luozi|CD|S0
LZM|Luzamba Airport|Luzamba|AO|S0
LZN|Matsu Nangan Airport|Matsu (Nangan)|TW|M1
LZO|Luzhou Yunlong Airport|Luzhou (Yunlong)|CN|M1
LZR|Lizard Island Airport||AU|S0
LZU|Gwinnett County Briscoe Field|Lawrenceville|US|S0
LZY|Nyingchi Mainling Airport|Nyingchi (Mainling)|CN|M1
MAA|Chennai International Airport|Chennai|IN|L1
MAB|João Correa da Rocha Airport|Marabá|BR|M1
MAC|Macon Downtown Airport|Macon|US|S0
MAD|Adolfo Suárez Madrid–Barajas Airport|Madrid|ES|L1
MAE|Madera Municipal Airport|Madera|US|S0
MAF|Midland International Air and Space Port|Midland|US|M1
MAG|Madang Airport|Madang|PG|M1
MAH|Menorca Airport|Mahón (Maó)|ES|L1
MAJ|Marshall Islands International Airport|Majuro Atoll|MH|L1
MAK|Malakal International Airport|Malakal|SS|M1
MAL|Mangole Airport, Falabisahaya|Mangole Island|ID|S0
MAM|General Servando Canales International Airport|Matamoros|MX|M1
MAN|Manchester Airport|Manchester, Greater Manchester|GB|L1
MAO|Eduardo Gomes International Airport|Manaus|BR|L1
MAP|Mamai Airport|Mamai|PG|S0
MAQ|Mae Sot Airport||TH|M1
MAR|La Chinita International Airport|Maracaibo|VE|L1
MAS|Momote Airport|Manus Island|PG|M1
MAT|Tshimpi Airport|Matadi|CD|S0
MAU|Maupiti Airport||PF|M1
MAV|Maloelap Island Airport|Maloelap Island|MH|S0
MAW|Malden Regional Airport|Malden|US|S0
MAX|Ouro Sogui Airport|Ouro Sogui|SN|M0
MAY|Clarence A. Bain Airport|Mangrove Cay|BS|M0
MAZ|Eugenio Maria De Hostos Airport|Mayaguez|PR|M1
MBA|Moi International Airport|Mombasa|KE|L1
MBB|Marble Bar Airport||AU|S0
MBC|M'Bigou Airport|M'Bigou|GA|S0
MBD|Mmabatho International Airport|Mafeking|ZA|M1
MBE|Monbetsu Airport|Monbetsu|JP|M1
MBF|Porepunkah Airport||AU|S0
MBG|Mobridge Municipal Airport|Mobridge|US|M0
MBH|Maryborough Airport|Maryborough|AU|S0
MBI|Songwe Airport|Mbeya|TZ|M1
MBJ|Sangster International Airport|Montego Bay|JM|L1
MBK|Orlando Villas Boas Regional Airport|Matupá|BR|S0
MBL|Manistee County Blacker Airport|Manistee|US|S1
MBM|Mkambati Airport|Mkambati|ZA|S0
MBN|Mount Barnett Airport|Wunaamin Miliwundi Ranges|AU|S0
MBO|Mamburao Airport|Mamburao|PH|M0
MBP|Moyobamba Airport|Moyobamba|PE|S0
MBQ|Mbarara Airport|Mbarara|UG|S0
MBS|MBS International Airport|Freeland|US|M1
MBT|Moises R. Espinosa Airport|Masbate|PH|M1
MBU|Babanakira Airport|Mbambanakira|SB|S0
MBV|Masa Airport|Masa|PG|S0
MBW|Melbourne Moorabbin Airport|Melbourne|AU|M1
MBX|Maribor Edvard Rusjan Airport|Maribor|SI|M1
MBY|Omar N Bradley Airport|Moberly|US|S0
MBZ|Maués Airport|Maués|BR|S0
MCA|Macenta Airport|Macenta|GN|S0
MCB|McComb-Pike County Airport / John E Lewis Field|McComb|US|M0
MCC|McClellan Airfield|Sacramento|US|M0
MCD|Mackinac Island Airport|Mackinac Island|US|S0
MCE|Merced Regional Macready Field|Merced|US|M1
MCF|MacDill Air Force Base|Tampa|US|M0
MCG|McGrath Airport|McGrath|US|M1
MCI|Kansas City International Airport|Kansas City|US|L1
MCJ|Jorge Isaac Airport|La Mina-Maicao|CO|M0
MCK|McCook Ben Nelson Regional Airport|McCook|US|M1
MCL|Denali National Park Airport|Denali Park|US|S0
MCN|Middle Georgia Regional Airport|Macon|US|M1
MCO|Orlando International Airport|Orlando|US|L1
MCP|Macapá - Alberto Alcolumbre International Airport|Macapá|BR|M1
MCS|Monte Caseros Airport|Monte Caseros|AR|M0
MCT|Muscat International Airport|Muscat/Seeb|OM|L1
MCU|Montluçon-Guéret Airport|Lépaud, Creuse|FR|M0
MCV|McArthur River Mine Airport|McArthur River Mine|AU|S1
MCW|Mason City Municipal Airport|Mason City|US|M1
MCX|Makhachkala Uytash International Airport|Makhachkala|RU|L1
MCY|Sunshine Coast Airport|Maroochydore|AU|L1
MCZ|Zumbi dos Palmares International Airport|Maceió|BR|L1
MDB|Melinda Airport|Hope Creek|BZ|S0
MDC|Sam Ratulangi International Airport|Manado|ID|L1
MDD|Midland Airpark|Midland|US|S0
MDE|Jose Maria Córdova International Airport|Medellín|CO|L1
MDF|Taylor County Airport|Medford|US|S0
MDG|Mudanjiang Hailang International Airport|Mudanjiang|CN|M1
MDH|Southern Illinois Airport|Murphysboro|US|M0
MDI|Makurdi Airport|Makurdi|NG|M1
MDJ|Madras Municipal Airport|Madras|US|S0
MDK|Mbandaka Airport|Mbandaka|CD|M1
MDL|Mandalay International Airport|Mandalay|MM|L1
MDM|Munduku Airport|Munduku|PG|S0
MDN|Madison Regional Airport|Madison|US|S0
MDO|Middleton Island Airport|Middleton Island|US|S0
MDP|Mindiptana Airport|Mindiptana-Papua Island|ID|S0
MDQ|Ástor Piazzola International Airport|Mar del Plata|AR|M1
MDR|Musiara Airstrip|Mara Rianta|KE|S0
MDS|Middle Caicos Airport|Middle Caicos|TC|S0
MDT|Harrisburg International Airport|Harrisburg|US|M1
MDU|Mendi Airport|Mendi|PG|M1
MDV|Médouneu Airport|Médouneu, Gabon|GQ|S0
MDW|Chicago Midway International Airport|Chicago|US|L1
MDX|Mercedes Airport|Mercedes|AR|S0
MDY|Henderson Field|Sand Island|UM|M0
MDZ|Governor Francisco Gabrielli International Airport|Mendoza|AR|L1
MEA|Macaé Benedito Lacerda Airport|Macaé|BR|M0
MEB|Melbourne Essendon Airport|Essendon Fields|AU|M1
MEC|Eloy Alfaro International Airport|Manta|EC|M1
MED|Prince Mohammad Bin Abdulaziz Airport|Medina|SA|L1
MEE|Maré Airport|Maré|NC|M1
MEF|Melfi Airport|Melfi|TD|S0
MEG|Malanje Airport|Malanje|AO|M1
MEH|Mehamn Airport|Mehamn|NO|M1
MEI|Key Field / Meridian Regional Airport|Meridian|US|M1
MEJ|Port Meadville Airport|Meadville|US|S0
MEK|Bassatine Airport|Meknes|MA|M0
MEL|Melbourne Airport|Melbourne|AU|L1
MEM|Frederick W. Smith International Airport|Memphis|US|L1
MEN|Mende-Brenoux Airfield|Mende/Brénoux|FR|M0
MEO|Dare County Regional Airport|Manteo|US|S0
MEP|Mersing Airport|Mersing|MY|S0
MEQ|Cut Nyak Dhien Airport|Kuala Pesisir|ID|M1
MER|Castle Airport|Merced|US|M0
MES|Soewondo Air Force Base|Medan|ID|M0
MET|Moreton Airport|Moreton|AU|S0
MEU|Monte Dourado - Serra do Areão Airport|Almeirim|BR|M0
MEV|Minden-Tahoe Airport|Minden|US|S0
MEW|Mweka Airport|Mweka|CD|S0
MEX|Mexico City Benito Juárez International Airport|Mexico City|MX|L1
MEY|Meghauli Airport|Meghauli|NP|S0
MEZ|Musina(Messina) Airport|Musina|ZA|S0
MFA|Mafia Airport|Kilindoni|TZ|S1
MFB|Monfort Airport|Monfort|CO|S0
MFC|Mafeteng Airport|Mafeteng|LS|S0
MFD|Mansfield Lahm Regional Airport|Mansfield|US|M0
MFE|McAllen Miller International Airport|McAllen|US|M1
MFF|Moanda Airport|Moanda|GA|S0
MFG|Muzaffarabad Airport|Muzaffarabad|PK|S1
MFH|Mesquite Airport|Mesquite|US|M0
MFI|Marshfield Municipal Airport|Marshfield|US|S0
MFJ|Moala Airport|Moala|FJ|S1
MFK|Matsu Beigan Airport|Matsu (Beigan)|TW|M1
MFL|Mount Full Stop Airport|Wando Vale|AU|S0
MFM|Macau International Airport|Nossa Senhora do Carmo|MO|L1
MFN|Milford Sound Airport||NZ|S0
MFO|Manguna Airport|Manguna|PG|S0
MFP|Manners Creek Airport||AU|S0
MFQ|Maradi Airport|Maradi|NE|M0
MFR|Rogue Valley International-Medford Airport|Medford|US|M1
MFS|Miraflores Airport|Miraflores|CO|S0
MFU|Mfuwe International Airport|Mfuwe|ZM|L1
MFV|Accomack County Airport|Melfa|US|S0
MFX|Méribel Altiport|Les Allues|FR|S0
MFZ|Meselia Airport|Demgulu|PG|S0
MGA|Augusto C. Sandino (Managua) International Airport|Managua|NI|L1
MGB|Mount Gambier Airport|Mount Gambier|AU|M1
MGC|Michigan City Municipal Airport|Michigan City|US|M1
MGD|Magdalena Airport|Magdalena|BO|S0
MGE|Dobbins Air Reserve Base|Marietta|US|M0
MGF|Regional de Maringá - Sílvio Name Júnior Airport|Maringá|BR|M1
MGH|Margate Airport|Margate|ZA|M1
MGI|National Wildlife Refuge Airport|Matagorda Island|US|S0
MGJ|Orange County Airport|Montgomery|US|S0
MGK|Mong Tong Airport|Mong Tong|MM|S0
MGL|Mönchengladbach Airport|Mönchengladbach|DE|M0
MGM|Montgomery Regional (Dannelly Field) Airport|Montgomery|US|M1
MGN|Baracoa Airport|Magangué|CO|M0
MGP|Manga Airport|Manga Mission|PG|S0
MGQ|Aden Adde International Airport|Mogadishu|SO|L1
MGR|Moultrie Municipal Airport|Moultrie|US|S0
MGS|Mangaia Island Airport|Mangaia Island|CK|S0
MGT|Milingimbi Airport|Milingimbi Island|AU|S1
MGU|Manaung Airport|Manaung|MM|S0
MGV|Margaret River (Station) Airport||AU|S0
MGW|Morgantown Municipal Airport Walter L. (Bill) Hart Field|Morgantown|US|M1
MGX|Moabi Airport|Moabi|GA|S0
MGY|Dayton-Wright Brothers Airport|Dayton|US|S0
MGZ|Myeik Airport|Mkeik|MM|M1
MHA|Mahdia Airport|Mahdia|GY|S0
MHC|Mocopulli Airport|Dalcahue|CL|S1
MHD|Mashhad International Airport|Mashhad|IR|L1
MHE|Mitchell Municipal Airport|Mitchell|US|S0
MHF|Morichal Airport|Morichal|CO|S0
MHG|Mannheim-City Airport|Mannheim|DE|M1
MHH|Leonard M. Thompson International Airport|Marsh Harbour|BS|M1
MHI|Moucha Airport|Moucha Island|DJ|S0
MHK|Manhattan Regional Airport|Manhattan|US|M1
MHL|Marshall Memorial Municipal Airport|Marshall|US|S0
MHM|Manaoba Airport|Manaoba|SB|S1
MHN|Hooker County Airport|Mullen|US|S0
MHO|Mount House Airport|Wunaamin Miliwundi Ranges|AU|S0
MHQ|Mariehamn Airport|Mariehamn|FI|M1
MHR|Sacramento Mather Airport|Sacramento|US|M0
MHS|Dunsmuir Muni-Mott Airport|Dunsmuir|US|S0
MHT|Manchester-Boston Regional Airport|Manchester|US|M1
MHU|Mount Hotham Airport|Mount Hotham|AU|M1
MHV|Mojave Air &  Space Port|Mojave|US|M0
MHW|Monteagudo Airport|El Bañado|BO|S0
MHX|Manihiki Island Airport|Manihiki Island|CK|S1
MHY|Morehead Airport|Morehead|PG|S0
MHZ|RAF Mildenhall|Bury Saint Edmunds, Suffolk|GB|M0
MIA|Miami International Airport|Miami|US|L1
MIB|Minot Air Force Base|Minot|US|M0
MIC|Crystal Airport|Minneapolis|US|S0
MID|Manuel Crescencio Rejón International Airport|Mérida|MX|L1
MIE|Delaware County Johnson Field|Muncie|US|M0
MIF|Roy Hurd Memorial Airport|Monahans|US|S0
MIG|Mianyang Nanjiao Airport|Mianyang (Fucheng)|CN|M1
MIH|Mitchell Plateau Airport|Mitchell Plateau|AU|S0
MII|Frank Miloye Milenkowichi–Marília State Airport|Marília|BR|M1
MIJ|Mili Island Airport|Mili Island|MH|S1
MIK|Mikkeli Airport|Mikkeli|FI|M0
MIM|Merimbula Airport|Merimbula|AU|M1
MIN|Minnipa Airport||AU|S0
MIO|Miami Municipal Airport|Miami|US|S0
MIP|Mitzpe Ramon Airfield|Mitzpe Ramon|IL|S0
MIQ|Millard Airport|Omaha|US|S0
MIR|Monastir Habib Bourguiba International Airport|Monastir|TN|M1
MIS|Misima Island Airport|Misima Island|PG|S1
MIT|Shafter Airport - Minter Field|Shafter|US|S0
MIU|Maiduguri International Airport|Maiduguri|NG|L1
MIV|Millville Municipal Airport|Millville|US|M0
MIW|Marshalltown Municipal Airport|Marshalltown|US|S0
MIX|Miriti Parana Airport|Mirití-Paraná|CO|S0
MIY|Mittebah Airport||AU|S0
MIZ|Mainoru Airstrip|Mainoru|AU|S0
MJA|Manja Airport|Manja|MG|S0
MJB|Mejit Atoll Airport|Mejit Atoll|MH|S0
MJC|Man Airport||CI|M0
MJD|Moenjodaro Airport|Moenjodaro|PK|M0
MJE|Majkin Airport|Majkin|MH|S1
MJF|Mosjøen Airport, Kjærstad|Mosjøen|NO|M1
MJG|Mayajigua Airport|Mayajigua|CU|S0
MJI|Mitiga International Airport|Tripoli|LY|L1
MJJ|Moki Airport|Moki|PG|S0
MJK|Shark Bay Airport|Denham|AU|M1
MJL|Mouilla Ville Airport|Mouila|GA|M0
MJM|Mbuji Mayi Airport|Mbuji Mayi|CD|M1
MJN|Amborovy Airport|Mahajanga|MG|L1
MJO|Mount Etjo Airport|Mount Etjo Safari Lodge|NA|S0
MJP|Manjimup Airport||AU|S0
MJQ|Jackson Municipal Airport|Jackson|US|S0
MJR|Miramar Airport|Miramar|AR|S0
MJS|Maganja da Costa Airport|Maganja|MZ|S0
MJT|Mytilene International Airport|Mytilene|GR|M1
MJU|Tampa Padang Airport|Mamuju|ID|S0
MJW|Mahenye Airport|Gonarezhou National Park|ZW|S0
MJX|Ocean County Airport|Toms River|US|S0
MJY|Motygino Airport|Motygino|RU|S1
MJZ|Mirny Airport|Mirny|RU|M1
MKB|Mekambo Airport|Mekambo|GA|S0
MKC|Charles B. Wheeler Downtown Airport|Kansas City|US|M0
MKE|General Mitchell International Airport|Milwaukee|US|L1
MKG|Muskegon County Airport|Muskegon|US|M1
MKH|Mokhotlong Airport|Mokhotlong|LS|S0
MKI|M'Boki Airport|Mboki|CF|S0
MKJ|Makoua Airport|Makoua|CG|S0
MKK|Molokai Airport|Kaunakakai|US|M1
MKL|McKellar-Sipes Regional Airport|Jackson|US|M1
MKM|Mukah Airport|Mukah|MY|M1
MKN|Malekolon Airport|Babase Island|PG|S0
MKO|Muskogee-Davis Regional Airport|Muskogee|US|S0
MKP|Makemo Airport|Makemo|PF|M1
MKQ|Mopah International Airport|Merauke|ID|M1
MKR|Meekatharra Airport||AU|M1
MKS|Mekane Selam Airport|Mekane Selam|ET|S0
MKT|Mankato Regional Airport|Mankato|US|S0
MKU|Makokou Airport|Makokou|GA|M1
MKW|Rendani Airport|Manokwari|ID|M1
MKY|Mackay Airport|Mackay|AU|M1
MKZ|Malacca International Airport|Malacca|MY|M1
MLA|Malta International Airport|Valletta|MT|L1
MLB|Melbourne Orlando International Airport|Melbourne|US|M1
MLC|Mc Alester Regional Airport|Mc Alester|US|M0
MLD|Malad City Airport|Malad City|US|S0
MLE|Velana International Airport|Malé|MV|L1
MLF|Milford Municipal-Ben and Judy Briscoe Field|Milford|US|S0
MLG|Abdul Rachman Saleh Airport|Malang|ID|M1
MLI|Quad City International Airport|Moline|US|M1
MLJ|Baldwin County Regional Airport|Milledgeville|US|S0
MLK|Malta Airport|Malta|US|S0
MLL|Marshall Don Hunter Sr Airport|Marshall|US|S1
MLM|General Francisco J. Mujica International Airport|Morelia|MX|L1
MLN|Melilla Airport|Melilla|ES|M1
MLO|Milos Airport|Milos Island|GR|S1
MLP|Malabang Airport|Malabang|PH|S0
MLQ|Malalaua Airport|Malalaua|PG|S0
MLR|Millicent Airport||AU|S0
MLS|Miles City Airport - Frank Wiley Field|Miles City|US|M0
MLT|Millinocket Municipal Airport|Millinocket|US|S0
MLU|Monroe Regional Airport|Monroe|US|M1
MLV|Merluna Airport|Merluna|AU|S0
MLW|Spriggs Payne Airport|Monrovia|LR|M1
MLX|Malatya Erhaç Airport|Malatya|TR|M1
MLY|Manley Hot Springs Airport|Manley Hot Springs|US|S1
MLZ|Cerro Largo International Airport|Melo|UY|S0
MMB|Memanbetsu Airport|Ōzora|JP|M1
MMC|Ciudad Mante Los Huastecas National Airport|Ciudad Mante|MX|S0
MMD|Minamidaito Airport|Minamidaito|JP|M1
MME|Teesside International Airport|Darlington, Durham|GB|M1
MMF|Mamfe Airport|Mamfe|CM|S0
MMG|Mount Magnet Airport||AU|M1
MMH|Mammoth Yosemite Airport|Mammoth Lakes|US|M1
MMI|McMinn County Airport|Athens|US|S0
MMJ|Shinshu-Matsumoto Airport|Matsumoto|JP|M1
MMK|Emperor Nicholas II Murmansk Airport|Murmansk|RU|L1
MML|Southwest Minnesota Regional Airport - Marshall/Ryan Field|Marshall|US|S0
MMM|Middlemount Airport||AU|S0
MMN|Minute Man Air Field|Stow|US|S0
MMO|Maio Airport|Vila do Maio|CV|M1
MMP|San Bernardo Airport|Santa Cruz de Mompóx|CO|S0
MMQ|Mbala Airport|Mbala|ZM|S0
MMS|Selfs Airport|Marks|US|S0
MMT|Mc Entire Joint National Guard Base|Eastover|US|M0
MMU|Morristown Municipal Airport|Morristown|US|M0
MMV|Mal Airport|Mal Island|PG|S0
MMX|Malmö Sturup Airport|Malmö|SE|L1
MMY|Miyako Airport|Miyakojima|JP|M1
MMZ|Maymana Zahiraddin Faryabi Airport|Maymana|AF|M0
MNA|Melangguane Airport|Karakelong Island|ID|S0
MNB|Muanda Airport|Muanda|CD|S0
MNC|Nacala International Airport|Nacala|MZ|M1
MND|Medina Airport|Medina|CO|S0
MNE|Mungeranie Airport|Mungeranie|AU|S0
MNF|Mana Island Airport|Mana Island|FJ|S1
MNG|Maningrida Airport|Maningrida|AU|M1
MNH|Mussanah Airport|Al Masna'ah|OM|M0
MNI|John A. Osborne Airport|Gerald's Park|MS|L1
MNJ|Mananjary Airport|Mananjary|MG|M1
MNK|Maiana Airport|Maiana|KI|S0
MNL|Ninoy Aquino International Airport|Manila (Pasay)|PH|L1
MNM|Menominee–Marinette Twin County Airport|Menominee|US|S0
MNN|Marion Municipal Airport|Marion|US|S0
MNO|Manono Airport|Manono|CD|S0
MNP|Maron Island Airport|Hermit Islands|PG|S0
MNQ|Monto Airport||AU|S0
MNR|Mongu Airport|Mongu|ZM|M0
MNS|Mansa Airport|Mansa|ZM|S0
MNT|Minto Al Wright Airport|Minto|US|S1
MNU|Mawlamyine Airport|Mawlamyine|MM|S1
MNV|Mount Valley Airport||AU|S0
MNW|Macdonald Downs Airport||AU|S0
MNX|Manicoré Airport|Manicoré|BR|M1
MNY|Mono Airport|Stirling Island|SB|S1
MNZ|Washington Manassas Harry P. Davis Field|Manassas|US|M0
MOA|Orestes Acosta Airport|Moa|CU|M0
MOB|Mobile Regional Airport|Mobile|US|M1
MOC|Mário Ribeiro Airport|Montes Claros|BR|M1
MOD|Modesto City Co-Harry Sham Field|Modesto|US|M0
MOE|Momeik Airport||MM|M0
MOF|Frans Xavier Seda Airport|Waioti|ID|S1
MOG|Mong Hsat Airport|Mong Hsat|MM|M1
MOH|Maleo Airport|Morowali|ID|S1
MOI|Mitiaro Island Airport|Mitiaro Island|CK|S1
MOJ|Moengo Airstrip|Moengo|SR|S1
MOK|Muynak Airport|Muynak|UZ|S0
MOL|Molde Airport, Årø|Årø|NO|M1
MOM|Letfotar Airport|Moudjeria|MR|S0
MON|Mount Cook Airport||NZ|M0
MOO|Moomba Airport|Moomba|AU|S0
MOP|Mount Pleasant Municipal Airport|Mount Pleasant|US|S0
MOQ|Morondava Airport|Morondava|MG|M1
MOR|Morristown Regional Airport|Morristown|US|S0
MOS|Moses Point Airport|Elim|US|S0
MOT|Minot International Airport|Minot|US|M1
MOU|Mountain Village Airport|Mountain Village|US|S1
MOV|Moranbah Airport|Moranbah|AU|M1
MOX|Morris Municipal Airport Charlie Schmidt Field|Morris|US|S0
MOY|Monterrey Airport|Monterrey|CO|S0
MOZ|Moorea Temae Airport|Moorea-Maiao|PF|M1
MPA|Katima Mulilo Airport|Mpacha|NA|M1
MPC|Muko Muko Airport|Muko Muko|ID|S1
MPD|Sindhri Tharparkar Airport|Sindhri|PK|S0
MPF|Mapoda Airport|Mapoda|PG|S0
MPG|Makini Airport|Makini|PG|S0
MPH|Godofredo P. Ramos Airport|Caticlan|PH|M1
MPI|Mamitupu Airport|Mamitupu|PA|S0
MPJ|Petit Jean Park Airport|Morrilton|US|S0
MPL|Montpellier-Méditerranée Airport|Montpellier/Méditerranée|FR|L1
MPM|Maputo Airport|Maputo|MZ|L1
MPN|Mount Pleasant Airport / RAF Mount Pleasant|Mount Pleasant|FK|M1
MPO|Pocono Mountains Municipal Airport|Mount Pocono|US|S0
MPP|Mulatupo Airport|Mulatupo|PA|S0
MPR|Mc Pherson Airport|Mc Pherson|US|S0
MPS|Mount Pleasant Regional Airport|Mount Pleasant|US|S0
MPT|Maliana Airport|Maliana|TL|S0
MPU|Mapua(Mabua) Airport|Tatau Island|PG|S0
MPV|Edward F Knapp State Airport|Barre/Montpelier|US|M0
MPW|Mariupol International Airport|Mariupol|UA|M0
MPX|Miyanmin Airport|Miyanmin|PG|S0
MPY|Maripasoula Airport|Maripasoula|GF|M1
MPZ|Mount Pleasant Municipal Airport|Mount Pleasant|US|S0
MQA|Mandora Airport|Eighty Mile Beach|AU|S0
MQB|Macomb Municipal Airport|Macomb|US|S0
MQC|Miquelon Airport|Miquelon|PM|S1
MQD|Maquinchao Airport|Maquinchao|AR|S0
MQE|Marqua Airport|Marqua|AU|S0
MQF|Magnitogorsk International Airport|Magnitogorsk|RU|L1
MQG|Midgard Airport|Midgard|NA|S0
MQH|Minaçu Airport|Minaçu|BR|M0
MQJ|Moma Airport|Khonuu|RU|M1
MQK|San Matías Airport|San Matías|BO|S0
MQL|Mildura Airport|Mildura|AU|M1
MQM|Mardin Airport|Mardin|TR|M1
MQN|Mo i Rana Airport, Røssvoll|Mo i Rana|NO|M1
MQO|Malam Airport|Malam|PG|S0
MQP|Kruger Mpumalanga International Airport|Mbombela|ZA|L1
MQQ|Moundou Airport|Moundou|TD|M0
MQR|Mosquera Airport|Mosquera|CO|S0
MQS|Mustique Airport|Lovell|VC|M1
MQT|Marquette Sawyer Regional Airport|Gwinn|US|M1
MQU|Mariquita Airport|Mariquita|CO|M0
MQV|Mostaganem Airport|Sayada|DZ|S0
MQW|Telfair Wheeler Airport|Mc Rae|US|S0
MQX|Mekele Alula Aba Nega Airport|Mekele|ET|M1
MQY|Smyrna Airport|Smyrna|US|M0
MQZ|Margaret River Airport||AU|S0
MRA|Misrata International Airport|Misrata|LY|S1
MRB|Eastern WV Regional Airport/Shepherd Field|Martinsburg|US|M0
MRC|Maury County Airport|Columbia/Mount Pleasant|US|S0
MRD|Alberto Carnevalli Airport|Mérida|VE|M0
MRE|Mara Serena Lodge Airstrip|Serena|KE|M1
MRF|Marfa Municipal Airport|Marfa|US|S0
MRG|Mareeba Airport|Mareeba|AU|M0
MRH|May River Airstrip|May River|PG|S0
MRI|Merrill Field|Anchorage|US|M1
MRK|Marco Island Executive Airport|Marco Island|US|S0
MRM|Manari Airport|Manari|PG|S0
MRN|Foothills Regional Airport|Morganton|US|S0
MRO|Hood Airport|Masterton|NZ|M0
MRP|Marla Airport|Marla|AU|S0
MRQ|Marinduque Airport|Gasan|PH|M0
MRR|Jose Maria Velasco Ibarra Airport|Macará|EC|M0
MRS|Marseille Provence Airport|Marignane, Bouches-du-Rhône|FR|L1
MRT|Moroak Airport|Moroak|AU|S0
MRU|Sir Seewoosagur Ramgoolam International Airport|Plaine Magnien|MU|L1
MRV|Mineralnye Vody Airport|Mineralnyye Vody|RU|L1
MRW|Lolland Falster Maribo Airport|Rødby|DK|M0
MRX|Mahshahr Airport|Mahshahr|IR|M1
MRY|Monterey Regional Airport|Monterey|US|M1
MRZ|Moree Airport|Moree|AU|M1
MSA|Muskrat Dam Airport|Muskrat Dam|CA|S1
MSC|Falcon Field|Mesa|US|S0
MSF|Mount Swan Airport||AU|S0
MSG|Matsaile Airport|Matsaile|LS|S0
MSH|RAFO Masirah|Masirah|OM|M0
MSI|Masalembo Airport|Masalembo Island|ID|S0
MSJ|Misawa Airport / Misawa Air Base|Misawa|JP|M1
MSK|Morelia Airport|Puerto Gaitán|CO|S0
MSL|Northwest Alabama Regional Airport|Muscle Shoals|US|M1
MSM|Masi Manimba Airport|Masi Manimba|CD|S0
MSN|Dane County Regional Truax Field|Madison|US|M1
MSO|Missoula Montana Airport|Missoula|US|M1
MSP|Minneapolis–Saint Paul International Airport / Wold–Chamberlain Field|Minneapolis|US|L1
MSQ|Minsk National Airport|Minsk|BY|L1
MSR|Muş Airport|Muş|TR|M1
MSS|Massena International Airport Richards Field|Massena|US|M1
MST|Maastricht Aachen Airport|Maastricht|NL|L1
MSU|Moshoeshoe I International Airport|Maseru(Mazenod)|LS|L1
MSV|Sullivan County International Airport|Monticello|US|S0
MSW|Massawa International Airport|Massawa|ER|M0
MSX|Mossendjo Airport|Mossendjo|CG|S0
MSY|Louis Armstrong New Orleans International Airport|New Orleans|US|L1
MSZ|Welwitschia Mirabilis International Airport|Moçâmedes|AO|M1
MTA|Matamata Glider Airport||NZ|S0
MTB|Montelibano Airport|Montelíbano|CO|S0
MTC|Selfridge Air National Guard Base Airport|Mount Clemens|US|M0
MTD|Mount Sanford Station Airport||AU|S0
MTE|Monte Alegre Airport|Monte Alegre|BR|S0
MTF|Mizan Teferi Airport|Mizan Teferi|ET|S1
MTG|Vila Bela da Santíssima Trindade Airport|Vila Bela Da Santíssima Trindade|BR|S0
MTH|Florida Keys Marathon International Airport|Marathon|US|M0
MTI|Mosteiros Airport|Vila do Mosteiros|CV|S0
MTJ|Montrose Regional Airport|Montrose|US|M1
MTK|Makin Island Airport|Makin Island|KI|S0
MTL|Maitland Airport||AU|S0
MTN|Martin State Airport|Baltimore|US|M0
MTO|Coles County Memorial Airport|Mattoon|US|S0
MTP|Montauk Airport|Montauk|US|S1
MTQ|Mitchell Airport||AU|S0
MTR|Los Garzones Airport|Montería|CO|M1
MTS|Matsapha International Airport|Manzini|SZ|M0
MTT|Minatitlán/Coatzacoalcos International Airport|Cosoleacaque|MX|M1
MTU|Montepuez Airport|Montepuez|MZ|S0
MTV|Mota Lava Airport|Ablow|VU|S0
MTW|Manitowoc County Airport|Manitowoc|US|S0
MTX|Metro Field|Fairbanks|US|S0
MTY|Monterrey International Airport|Monterrey|MX|L1
MTZ|Bar Yehuda Airfield|Masada|IL|M0
MUA|Munda Airport|Munda|SB|M1
MUB|Maun International Airport|Maun|BW|L1
MUC|Munich Airport|Munich|DE|L1
MUD|Mueda Airport|Mueda|MZ|M0
MUE|Waimea Kohala Airport|Waimea (Kamuela)|US|M1
MUG|Mulege Airport|Mulege|MX|S0
MUH|Mersa Matruh International Airport|Marsa Matruh|EG|L1
MUI|Muir Army Air Field (Fort Indiantown Gap) Airport|Fort Indiantown Gap(Annville)|US|M0
MUJ|Mui River Airport|Omo National Park|ET|S0
MUK|Mauke Airport|Mauke Island|CK|S1
MUL|Spence Airport|Moultrie|US|S0
MUM|Muli Airport|Muli|MV|S0
MUN|José Tadeo Monagas International Airport|Maturín|VE|M1
MUO|Mountain Home Air Force Base|Mountain Home|US|M0
MUP|Mulga Park Airport||AU|S0
MUQ|Muccan Station Airport|Muccan Station|AU|S0
MUR|Marudi Airport|Marudi|MY|M1
MUS|JMSDF Minami Torishima Air Base|Ogasawara|JP|S0
MUT|Muscatine Municipal Airport|Muscatine|US|S0
MUU|Barra Grande Airport|Maraú|BR|S0
MUW|Ghriss Airport|Ghriss|DZ|M0
MUX|Multan International Airport|Multan|PK|L1
MUY|Mouyondzi Airport|Mouyondzi|CG|S0
MUZ|Musoma Airport|Musoma|TZ|S1
MVA|Mývatn Airport|Myvatn|IS|M0
MVB|M'Vengue El Hadj Omar Bongo Ondimba International Airport|Franceville|GA|M1
MVC|Monroe County Aeroplex Airport|Monroeville|US|S0
MVD|Carrasco General Cesáreo L. Berisso International Airport|Ciudad de la Costa|UY|L1
MVE|Montevideo Chippewa County Airport|Montevideo|US|S0
MVF|Dix-Sept Rosado Airport|Mossoró|BR|M1
MVK|Mulka Airport|Mulka|AU|S0
MVL|Morrisville-Stowe State Airport|Morrisville|US|S0
MVM|Kayenta Airport|Kayenta|US|S0
MVN|Mount Vernon Outland Airport|Mount Vernon|US|S0
MVO|Mongo Airport|Mongo|TD|S0
MVP|Fabio Alberto Leon Bentley Airport|Mitú|CO|M1
MVQ|Mogilev Airport|Mogilev|BY|M1
MVR|Salak Airport|Maroua|CM|M1
MVS|Mucuri Airport|Mucuri|BR|S0
MVT|Mataiva Airport||PF|M1
MVU|Musgrave Airport|Musgrave|AU|S0
MVV|Megève Altiport|Megève|FR|S0
MVW|Skagit Regional Airport|Burlington|US|S0
MVX|Minvoul Airport|Minvoul|GA|S0
MVY|Martha's Vineyard Airport|Martha's Vineyard|US|S1
MVZ|Masvingo International Airport|Masvingo|ZW|M0
MWA|Veterans Airport of Southern Illinois|Marion|US|M1
MWB|Morawa Airport||AU|S0
MWC|Lawrence J Timmerman Airport|Milwaukee|US|S0
MWD|Mianwali Air Base|Mianwali|PK|M0
MWE|Merowe Airport|Merowe|SD|M0
MWF|Maewo-Naone Airport|Maewo Island|VU|S0
MWG|Marawaka Airport|Marawaka|PG|S0
MWH|Grant County International Airport|Moses Lake|US|M0
MWI|Maramuni Airport|Maramuni|PG|S0
MWJ|Matthews Ridge Airport|Matthews Ridge|GY|S0
MWK|Matak Airport|Palmatak|ID|S0
MWL|Mineral Wells Regional Airport|Mineral Wells|US|M1
MWM|Windom Municipal Airport|Windom|US|S0
MWN|Mwadui Airport|Mwadui|TZ|S0
MWO|Middletown Regional Airport|Middletown|US|S0
MWQ|Magway Airport|Magway|MM|S1
MWR|Motswari Airport|Motswari Private Game Reserve|ZA|S0
MWS|Indonesia Morowali Industrial Park (IMIP) Airport|Morowali|ID|S0
MWT|Moolawatana Airport|Moolawatana Station|AU|S0
MWU|Mussau Airport|Mussau Island|PG|S0
MWV|Mondulkiri Airport|Sen Monorom|KH|S0
MWX|Muan International Airport|Muan (Piseo-ri)|KR|L1
MWY|Miranda Downs Airport|Miranda Downs|AU|S0
MWZ|Mwanza International Airport|Mwanza|TZ|L1
MXA|Manila Municipal Airport|Manila|US|S0
MXB|Andi Jemma Airport|Masamba|ID|S0
MXC|Monticello Airport|Monticello|US|S0
MXD|Marion Downs Airport|Marion Downs|AU|S0
MXE|Laurinburg Maxton Airport|Maxton|US|S0
MXF|Maxwell Air Force Base|Montgomery|US|M0
MXH|Moro Airport|Moro|PG|S1
MXI|Mati National Airport|Mati|PH|M0
MXJ|Minna Airport|Minna|NG|M0
MXK|Mindik Airport|Mindik|PG|S0
MXL|General Rodolfo Sánchez Taboada International Airport|Mexicali|MX|M1
MXM|Morombe Airport|Morombe|MG|M0
MXN|Morlaix-Ploujean Airport|Morlaix/Ploujean|FR|M0
MXO|Monticello Regional Airport|Monticello|US|S0
MXP|Milan Malpensa International Airport|Ferno (VA)|IT|L1
MXQ|Lorenzo Airport|Cairu|BR|S0
MXR|Myrhorod Air Base|Myrhorod|UA|S0
MXS|Maota Airport|Maota|WS|S0
MXT|Maintirano Airport|Maintirano|MG|S0
MXU|Mullewa Airport||AU|S0
MXV|Mörön Airport|Mörön|MN|M1
MXW|Mandalgobi Airport|Mandalgobi|MN|S1
MXX|Mora Airport|Mora|SE|M1
MXY|Mc Carthy Airport|Mccarthy|US|S0
MXZ|Meizhou Meixian Changgangji International Airport|Meizhou (Meixian)|CN|S1
MYA|Moruya Airport|Moruya|AU|M1
MYB|Mayumba Airport|Mayumba|GA|S0
MYC|Escuela Mariscal Sucre Airport|Maracay|VE|M0
MYD|Malindi International Airport|Malindi|KE|M1
MYE|Miyakejima Airport|Miyakejima|JP|M1
MYF|Montgomery-Gibbs Executive Airport|San Diego|US|S0
MYG|Mayaguana Airport|Abraham Bay Settlement|BS|M1
MYH|Marble Canyon Airport|Marble Canyon|US|S0
MYI|Murray Island Airport|Murray Island|AU|S1
MYJ|Matsuyama Airport|Matsuyama|JP|L1
MYK|May Creek Airport|May Creek|US|S1
MYL|McCall Municipal Airport|McCall|US|M1
MYM|Monkey Mountain Airport|Monkey Mountain|GY|S0
MYN|Marib Airport|Marib|YE|S0
MYO|Myroodan Station Airport||AU|S0
MYP|Mary International Airport|Mary|TM|M1
MYQ|Mysore Airport|Mysore|IN|M1
MYR|Myrtle Beach International Airport|Myrtle Beach|US|L1
MYS|Moyale Airport|Moyale|ET|S0
MYT|Myitkyina Airport|Myitkyina|MM|M1
MYU|Mekoryuk Airport|Mekoryuk|US|M1
MYV|Yuba County Airport|Marysville|US|M0
MYW|Mtwara Airport|Mtwara|TZ|M1
MYX|Menyamya Airport|Menyamya|PG|S0
MYY|Miri Airport|Miri|MY|M1
MYZ|Monkey Bay Airport|Monkey Bay|MW|S0
MZA|Mayor PNP Nancy Flores Paucar Airport|Mazamari|PE|S0
MZB|Mocímboa da Praia Airport|Mocímboa da Praia|MZ|M0
MZC|Mitzic Airport|Mitzic|GA|S0
MZD|Méndez Airport|Santiago de Méndez|EC|S0
MZE|Manatee Airport|Spanish Lookout|BZ|S0
MZG|Penghu Magong Airport|Huxi|TW|L1
MZH|Amasya Merzifon Airport|Amasya|TR|M1
MZI|Mopti Airport|Sévaré|ML|M1
MZJ|Pinal Airpark|Marana|US|S0
MZK|Marakei Airport|Marakei|KI|S0
MZL|La Nubia Airport|Manizales|CO|M1
MZN|Minj Airport|Minj|PG|S0
MZO|Sierra Maestra International Airport|Manzanillo|CU|M1
MZP|Motueka Airport||NZ|S0
MZQ|Mkuze Airport|Mkuze|ZA|M1
MZR|Mazar-i-Sharif International Airport|Mazar-i-Sharif|AF|L1
MZS|Moradabad Airport|Moradabad|IN|M1
MZT|General Rafael Buelna International Airport|Mazatlàn|MX|L1
MZU|Muzaffarpur Airport|Muzaffarpur|IN|M0
MZV|Mulu Airport|Mulu|MY|M1
MZW|Mecheria Airport|Mecheria|DZ|M1
MZY|Mossel Bay Airport|Mossel Bay|ZA|S0
MZZ|Marion Municipal Airport|Marion|US|S0
NAA|Narrabri Airport|Narrabri|AU|M1
NAC|Naracoorte Airport||AU|S0
NAD|Macanal Airport|Macanal|CO|S0
NAE|Natitingou Airport|Natitingou|BJ|S0
NAF|Banaina Airport|Banaina-Borneo Island|ID|S0
NAG|Dr. Babasaheb Ambedkar International Airport|Nagpur|IN|L1
NAH|Naha Airport|Tabukan Utara, Sangihe Islands|ID|M1
NAI|Annai Airport|Annai|GY|S0
NAJ|Nakhchivan International Airport|Nakhchivan|AZ|L1
NAK|Nakhon Ratchasima Airport|Chaloem Phra Kiat|TH|M0
NAL|Nalchik Airport|Nalchik|RU|M1
NAM|Namniwel Airport|Namniwel|ID|M1
NAN|Nadi International Airport|Nadi|FJ|L1
NAO|Nanchong Gaoping Airport|Nanchong (Gaoping)|CN|S1
NAP|Naples International Airport|Napoli|IT|L1
NAQ|Qaanaaq Airport|Qaanaaq|GL|M1
NAR|Puerto Nare Airport|Armenia|CO|S0
NAS|Lynden Pindling International Airport|Nassau|BS|L1
NAT|Rio Grande do Norte/São Gonçalo do Amarante–Governador Aluízio Alves International Airport|Natal|BR|L1
NAU|Napuka Island Airport|Napuka Island|PF|S1
NAV|Nevşehir Kapadokya Airport|Nevşehir|TR|L1
NAW|Narathiwat Airport||TH|M1
NAY|Beijing Nanyuan Airport|Beijing|CN|S0
NAZ|Nana Airport|Star Harbor|SB|S0
NBA|Nambaiyufa Airport|Nambaiyufa|PG|S0
NBB|Barranco Minas Airport|Barranco Minas|CO|S0
NBC|Begishevo Airport|Nizhnekamsk|RU|M1
NBE|Enfidha - Hammamet International Airport|Enfidha|TN|M1
NBG|New Orleans NAS JRB/Alvin Callender Field|New Orleans|US|M0
NBH|Nambucca Heads Airport|Nambucca Heads|AU|S0
NBJ|Dr. Antonio Agostinho Neto International Airport|Luanda (Ícolo e Bengo)|AO|L1
NBL|Wannukandi Airport|San Blas|PA|S0
NBN|Annobón Airport|San Antonio de Palé|GQ|S1
NBO|Jomo Kenyatta International Airport|Nairobi|KE|L1
NBS|Changbaishan Airport|Baishan|CN|M1
NBW|Leeward Point Field|Guantanamo Bay Naval Station|CU|M0
NBX|Douw Aturure Airport|Nabire|ID|M0
NCA|North Caicos Airport|North Caicos|TC|M1
NCE|Nice-Côte d'Azur Airport|Nice, Alpes-Maritimes|FR|L1
NCG|Aeropuerto Municipal de Nuevo Casas Grandes|Nuevo Casas Grandes|MX|S0
NCH|Nachingwea Airport|Nachingwea|TZ|S0
NCI|Necocli Airport|Necocli|CO|S0
NCJ|Sunchales Aeroclub Airport|Sunchales|AR|S0
NCL|Newcastle International Airport|Newcastle upon Tyne, Tyne and Wear|GB|L1
NCN|Chenega Bay Airport|Chenega|US|S1
NCO|Quonset State Airport|North Kingstown|US|M0
NCR|San Carlos Airport|San Carlos|NI|S0
NCS|Newcastle Airport|Newcastle|ZA|M0
NCT|Guanacaste Airport|Nicoya/Guanacate|CR|S0
NCU|Nukus International Airport|Nukus|UZ|L1
NCY|Annecy Meythet airport|Annecy|FR|M1
NDA|Bandanaira Airport|Bandanaira|ID|S0
NDB|Nouadhibou International Airport|Nouadhibou|MR|L1
NDC|Nanded Airport|Nanded|IN|M1
NDD|Sumbe Airport|Sumbe|AO|M0
NDE|Mandera Airport|Mandera|KE|S0
NDF|N'dalatando Airport|N'dalatando|AO|S0
NDG|Qiqihar Sanjiazi Airport|Qiqihar|CN|L1
NDI|Namudi Airport|Namudi|PG|S0
NDJ|N'Djamena International Airport|N'Djamena|TD|L1
NDK|Namorik Airport|Namorik Atoll|MH|S0
NDL|N'Délé Airport|N'Délé|CF|S0
NDM|Mendi Airport|Mendi|ET|S0
NDN|Nadunumu Airport|Nadunumu|PG|S0
NDR|Nador Al Aaroui International Airport|Al Aaroui|MA|L1
NDS|Sandstone Airport|Sandstone|AU|S0
NDU|Rundu Airport|Rundu|NA|M1
NDY|Sanday Airport|Sanday|GB|S1
NEC|Necochea Airport|Necochea|AR|M1
NEG|Negril Airport|Negril|JM|S0
NEI|Terney Airport|Terney|RU|S0
NEJ|Nejjo Airport|Nejo|ET|S0
NEK|Nekemte Airport|Nekemte|ET|S0
NEL|Lakehurst Maxfield Field Airport|Lakehurst|US|M0
NEN|Whitehouse Naval Outlying Field|Jacksonville|US|S0
NER|Chulman Airport|Neryungri|RU|M1
NEU|Sam Neua Airport||LA|M0
NEV|Vance W. Amory International Airport|Charlestown|KN|M1
NEW|Lakefront Airport|New Orleans|US|M0
NFG|Nefteyugansk Airport|Nefteyugansk|RU|M0
NFL|Fallon Naval Air Station|Fallon|US|M0
NFO|Mata'aho Airport|Angaha, Niuafo'ou Island|TO|S0
NFR|Nafurah 1 Airport|Nafurah 1|LY|S0
NGA|Young Airport||AU|M0
NGB|Ningbo Lishe International Airport|Ningbo|CN|L1
NGD|Captain Auguste George Airport|Anegada|VG|S0
NGE|N'Gaoundéré Airport|N'Gaoundéré|CM|M1
NGF|Kaneohe Bay MCAS (Marion E. Carl Field) Airport|Kaneohe|US|M0
NGI|Ngau Airport|Ngau|FJ|S1
NGK|Nogliki Airport|Nogliki|RU|S1
NGL|Ngala Airport|Ngala|ZA|S0
NGO|Chubu Centrair International Airport|Tokoname|JP|L1
NGP|Naval Air Station Corpus Christi Truax Field|Corpus Christi|US|M0
NGQ|Ngari Gunsa Airport|Shiquanhe|CN|M1
NGS|Nagasaki Airport|Nagasaki|JP|L1
NGU|Norfolk Naval Station (Chambers Field)|Norfolk|US|M0
NGW|Cabaniss Field Naval Outlying Landing Field|Corpus Christi|US|S0
NGX|Manang Airport|Ngawal|NP|S0
NHD|Al Minhad Air Base|Dubai|AE|M0
NHF|New Halfa Airport|New Halfa|SD|S0
NHK|Patuxent River Naval Air Station (Trapnell Field)|Patuxent River|US|M0
NHT|RAF Northolt|Northolt, Greater London|GB|M0
NHV|Nuku Hiva Airport|Nuku Hiva|PF|M1
NHX|Naval Outlying Field Barin|Foley|US|S0
NHZ|Brunswick Executive Airport|Brunswick|US|M0
NIA|Nimba Airport|Nimba|LR|S0
NIB|Nikolai Airport|Nikolai|US|S1
NIF|Camp Nifty Airport||AU|S0
NIG|Nikunau Airport|Nikunau|KI|S0
NIK|Niokolo-Koba Airport|Niokolo-Koba National Park|SN|S0
NIM|Diori Hamani International Airport|Niamey|NE|L1
NIN|Ninilchik Airport|Ninilchik|US|S0
NIO|Nioki Airport|Nioki|CD|S0
NIP|Jacksonville Naval Air Station (Towers Field)|Jacksonville|US|M0
NIR|Chase Field Industrial Airport|Beeville|US|S0
NIS|Simberi Airport|Simberi Island|PG|S0
NIT|Niort - Marais Poitevin Airport|Niort/Souché|FR|M0
NIU|Naiu Airport|Naiu Atoll|PF|S1
NIX|Nioro du Sahel Airport|Nioro du Sahel|ML|S0
NJA|JMSDF Atsugi Air Base / Naval Air Facility Atsugi|Ayase / Yamato|JP|M0
NJC|Nizhnevartovsk Airport|Nizhnevartovsk|RU|L1
NJF|Al Najaf International Airport|Najaf|IQ|L1
NJJ|Nenjiang Melgen Airport|Heihe|CN|S0
NJK|El Centro NAF Airport (Vraciu Field)|El Centro|US|M0
NKA|Nkan Airstrip|Ntoum|GA|S0
NKB|Noonkanbah Airport||AU|S0
NKC|Nouakchott–Oumtounsy International Airport|Nouakchott|MR|L1
NKD|Sinak Airport|Sinak|ID|S0
NKG|Nanjing Lukou International Airport|Nanjing|CN|L1
NKL|N'Kolo-Fuma Airport|N'Kolo-Fuma|CD|S0
NKM|Nagoya Airport / JASDF Komaki Air Base|Nagoya|JP|M1
NKN|Nankina Airport|Gwarawon|PG|S0
NKO|Ankokoambo Airport|Ankokoambo|MG|S0
NKP|Nukutepipi Airport|Nukutepipi|PF|S0
NKT|Şırnak Şerafettin Elçi Airport|Şırnak|TR|M1
NKU|Nkaus Airport|Nkaus|LS|S0
NKW|Naval Support Facility Diego Garcia|Diego Garcia|IO|M0
NKX|Miramar Marine Corps Air Station - Mitscher Field|San Diego|US|M0
NKY|Yokangassi Airport|Nkayi|CG|S0
NLA|Simon Mwansa Kapwepwe International Airport|Ndola|ZM|L1
NLC|Lemoore Naval Air Station (Reeves Field) Airport|Lemoore|US|M0
NLD|Quetzalcóatl International Airport|Nuevo Laredo|MX|M1
NLE|Jerry Tyler Memorial Airport|Niles|US|S0
NLF|Darnley Island Airport|Darnley Island|AU|S1
NLG|Nelson Lagoon Airport|Nelson Lagoon|US|S1
NLH|Ninglang Luguhu Airport|Ninglang|CN|M1
NLI|Nikolayevsk-na-Amure Airport|Nikolayevsk-na-Amure Airport|RU|M1
NLK|Norfolk Island International Airport|Burnt Pine|NF|M1
NLL|Nullagine Airport||AU|S0
NLN|Kneeland Airport|Kneeland|US|S0
NLO|Ndolo Airport|N'dolo|CD|M0
NLP|Nelspruit Airport|Nelspruit|ZA|S0
NLS|Nicholson Airport||AU|S0
NLT|Xinyuan Nalati Airport|Xinyuan|CN|M1
NLU|Felipe Ángeles International Airport|Mexico City|MX|L1
NLV|Mykolaiv International Airport [CLOSED]|Mykolaiv|UA|M0
NMA|Namangan International Airport|Namangan|UZ|L1
NMB|Daman Airport|Daman|IN|M0
NMC|Normans Cay Airport|Normans Cay|BS|M0
NME|Nightmute Airport|Nightmute|US|S1
NMF|Maafaru International Airport|Noonu Atoll|MV|M1
NMG|San Miguel Airport|Isla del Rey|PA|S0
NMI|Navi Mumbai International Airport|Navi Mumbai|IN|L1
NML|Fort McMurray / Mildred Lake Airport|Fort McMurray|CA|S0
NMN|Nomane Airport|Namane|PG|S0
NMP|New Moon Airport|Basalt|AU|S0
NMR|Nappa Merrie Airport||AU|S0
NMS|Namsang Airport|Namsang|MM|M0
NMT|Namtu Airport|Namtu|MM|S0
NNA|Kenitra Air Base|Kenitra|MA|M0
NNB|Santa Ana Airport|Santa Ana Island|SB|S1
NND|Nangade Airport|Nangade|MZ|S0
NNG|Nanning Wuxu International Airport|Nanning (Jiangnan)|CN|L1
NNI|Namutoni Airport|Namutoni|NA|S0
NNK|Naknek Airport|Naknek|US|S0
NNL|Nondalton Airport|Nondalton|US|S0
NNM|Naryan Mar Airport|Naryan Mar|RU|M1
NNR|Connemara Regional Airport|Inverin|IE|S1
NNT|Nan Airport||TH|M1
NNU|Nanuque Airport|Nanuque|BR|S0
NNX|Nunukan Airport|Nunukan-Nunukan Island|ID|S0
NNY|Nanyang Jiangying Airport|Nanyang (Wancheng)|CN|S1
NOA|Naval Air Station Nowra - HMAS Albatross|Nowra Hill|AU|M0
NOB|Nosara Airport|Nicoya|CR|M1
NOC|Ireland West Airport Knock|Charlestown|IE|L1
NOD|Norden-Norddeich Airport|Norddeich|DE|S1
NOG|Nogales International Airport|Nogales|MX|M0
NOI|Krymsk Air Base|Krymsk|RU|M0
NOJ|Noyabrsk Airport|Noyabrsk|RU|M1
NOK|Xavantina Airport|Nova Xavantina|BR|S0
NOM|Nomad River Airport|Nomad River|PG|S0
NON|Nonouti Airport|Nonouti|KI|S0
NOO|Naoro Airport|Naoro Vilage|PG|S0
NOP|Sinop Airport|Sinop|TR|M1
NOR|Norðfjörður Airport|Norðfjörður|IS|S0
NOS|Nosy Be International Airport|Nosy Be|MG|L1
NOT|Marin County Airport - Gnoss Field|Novato|US|S0
NOU|La Tontouta International Airport|Nouméa (La Tontouta)|NC|L1
NOV|Albano Machado Airport|Huambo|AO|M1
NOZ|Spichenkovo Airport|Novokuznetsk|RU|M1
NPA|Naval Air Station Pensacola Forrest Sherman Field|Pensacola|US|M0
NPE|Hawke's Bay Airport|Napier|NZ|M1
NPG|Nipa Airport|Nipa|PG|S0
NPH|J. Randy McKnight Nephi Municipal Airport|Nephi|US|S0
NPL|New Plymouth Airport|New Plymouth|NZ|M1
NPO|Nanga Pinoh Airport|Nanga Pinoh-Borneo Island|ID|M1
NPP|Napperby Airport|Napperby|AU|S0
NPR|Novo Progresso Airport|Novo Progresso|BR|S0
NPT|Newport State Airport|Newport|US|M1
NPU|San Pedro Airport|San Pedro de Urabá|CO|S0
NPY|Mpanda Airport|Mpanda|TZ|S0
NQA|Millington-Memphis Airport|Millington|US|M0
NQI|Kingsville Naval Air Station|Kingsville|US|M0
NQL|Niquelândia Airport|Niquelândia|BR|S0
NQN|Presidente Perón International Airport|Neuquén|AR|L1
NQT|Nottingham City Airport|Nottingham, Nottinghamshire|GB|M0
NQU|Reyes Murillo Airport|Nuquí|CO|S1
NQX|Naval Air Station Key West/Boca Chica Field|Key West|US|M0
NQY|Cornwall Airport Newquay|Newquay|GB|M1
NQZ|Nursultan Nazarbayev International Airport|Astana|KZ|L1
NRA|Narrandera Airport|Narrandera|AU|M1
NRB|Naval Station Mayport / Admiral David L McDonald Field|Jacksonville|US|M0
NRD|Norderney Airport|Norderney|DE|S1
NRE|Namrole Airport|Namrole|ID|S0
NRG|Narrogin Airport|Narrogin|AU|S0
NRI|Grand Lake Regional Airport|Afton|US|S0
NRK|Norrköping Airport|Norrköping|SE|M1
NRL|North Ronaldsay Airport|North Ronaldsay|GB|S1
NRM|Nara Airport|Keibane|ML|S0
NRN|Weeze (Niederrhein) Airport|Weeze|DE|L1
NRR|José Aponte de la Torre Airport|Ceiba|PR|M1
NRS|Naval Outlying Field Imperial Beach (Ream Field)|Imperial Beach|US|S0
NRT|Narita International Airport|Narita|JP|L1
NRY|Newry Airport|Newry|AU|S0
NSE|Whiting Field Naval Air Station - North|Milton|US|M0
NSH|Nowshahr Airport|Nowshahr|IR|M1
NSI|Yaoundé Nsimalen International Airport|Yaoundé|CM|L1
NSK|Alykel International Airport|Norilsk|RU|L1
NSL|Slayton Municipal Airport|Slayton|US|S0
NSM|Norseman Aerodrome|Norseman|AU|S0
NSN|Nelson Airport|Nelson|NZ|M1
NSO|Scone Airport||AU|S0
NSR|Serra da Capivara Airport|São Raimundo Nonato|BR|S0
NST|Nakhon Si Thammarat Airport|Nakhon Si Thammarat|TH|M1
NSV|Noosa Airport||AU|S0
NTB|Notodden Airport|Notodden|NO|M0
NTC|Paradise Island Airport|Santa Carolina|MZ|S0
NTD|Point Mugu Naval Air Station (Naval Base Ventura Co)|Point Mugu|US|M0
NTE|Nantes Atlantique Airport|Nantes|FR|L1
NTG|Nantong Xingdong International Airport|Nantong (Tongzhou)|CN|M1
NTI|Stenkol Airport|Bintuni|ID|S0
NTJ|Manti-Ephraim Airport|Manti|US|S0
NTL|Newcastle Airport|Williamtown|AU|L1
NTN|Normanton Airport|Normanton|AU|M1
NTQ|Noto Satoyama Airport|Wajima|JP|M1
NTR|Del Norte International Airport|Monterrey|MX|M0
NTT|Kuini Lavenia Airport|Niuatoputapu|TO|S1
NTU|Oceana Naval Air Station|Virginia Beach|US|M0
NTX|Ranai Airport|Ranai-Natuna Besar Island|ID|M1
NTY|Pilanesberg International Airport|Pilanesberg|ZA|M0
NUB|Numbulwar Airport||AU|S0
NUD|En Nahud Airport|En Nahud|SD|S0
NUE|Nuremberg Airport|Nuremberg|DE|L1
NUG|Nuguria Airstrip|Nuguria Island|PG|S0
NUH|Nunchia Airport|Nunchia|CO|S0
NUI|Nuiqsut Airport|Nuiqsut|US|M1
NUJ|Nojeh Air Base|Amirabad|IR|M0
NUK|Nukutavake Airport|Nukutavake|PF|S0
NUL|Nulato Airport|Nulato|US|S1
NUM|Neom Bay Airport|Sharma|SA|L1
NUP|Nunapitchuk Airport|Nunapitchuk|US|S1
NUQ|Moffett Federal Airfield|Mountain View|US|M0
NUR|Nullabor Motel Airport||AU|S0
NUS|Norsup Airport|Norsup|VU|S1
NUU|Nakuru Lanet Airport|Nakuru|KE|M0
NUW|Whidbey Island Naval Air Station (Ault Field)|Oak Harbor|US|M0
NUX|Novy Urengoy Airport|Novy Urengoy|RU|M1
NVA|Benito Salas Airport|Neiva|CO|M1
NVD|Nevada Municipal Airport|Nevada|US|S0
NVI|Navoi International Airport|Navoi|UZ|M1
NVM|Brigadeiro Eduardo Gomes Airport|Nova Mutum|BR|S0
NVN|Nervino Airport|Beckwourth|US|S0
NVP|Novo Aripuanã Airport|Novo Aripuanã|BR|S0
NVS|Nevers-Fourchambault Airport|Marzy, Nièvre|FR|M0
NVT|Ministro Victor Konder International Airport|Navegantes|BR|L1
NVY|Neyveli Airport|Neyveli|IN|S0
NWA|Mohéli Bandar Es Eslam Airport|Fomboni|KM|M0
NWH|Parlin Field|Newport|US|S0
NWI|Norwich Airport|Norwich, Norfolk|GB|M1
NWT|Nowata Airport|Nowata|PG|S0
NYA|Nyagan Airport|Nyagan|RU|M1
NYE|Nyeri Airport|Nyeri|KE|S0
NYG|Quantico Marine Corps Airfield / Turner Field|Quantico|US|M0
NYI|Sunyani Airport|Sunyani|GH|M1
NYK|Nanyuki Civil Airport|Gathiuru|KE|M1
NYM|Nadym Airport|Nadym|RU|M1
NYN|Nyngan Airport||AU|S0
NYO|Stockholm Skavsta Airport|Nyköping|SE|L1
NYR|Nyurba Airport|Nyurba|RU|S0
NYT|Nay Pyi Taw International Airport|Naypyitaw|MM|L1
NYU|Bagan Airport|Nyaung U|MM|S1
NYW|Monywar Airport|Monywar|MM|S0
NZA|Nzagi Airport|Nzagi|AO|S0
NZC|Maria Reiche Neuman Airport|Nazca|PE|M1
NZE|Nzérékoré Airport|Nzérékoré|GN|S0
NZG|Nizhneangarsk International Airport|Nizhneangarsk|RU|S1
NZH|Manzhouli Xijiao Airport|Manzhouli|CN|M1
NZL|Zhalantun Genghis Khan Airport|Zhalantun|CN|M1
NZY|North Island Naval Air Station-Halsey Field|San Diego|US|M0
OAA|Shank Air Base|Baraki Barak|AF|S0
OAG|Orange Airport|Orange|AU|M0
OAH|Shindand Air Base|Shindand|AF|S0
OAI|Bagram Airfield|Bagram|AF|M0
OAJ|Albert J Ellis Airport|Richlands|US|M1
OAK|Oakland San Francisco Bay Airport|Oakland|US|L1
OAL|Cacoal Airport|Cacoal|BR|S1
OAM|Oamaru Airport||NZ|M0
OAN|El Arrayán Airport|Olanchito|HN|S0
OAR|Marina Municipal Airport|Marina|US|S0
OAS|Sharana Airstrip|Sharana|AF|S0
OAX|Xoxocotlán International Airport|Oaxaca|MX|L1
OAZ|Camp Shorabak Airfield|Lashkar Gah|AF|S0
OBA|Oban Airport|Oban|AU|S0
OBC|Obock Airport|Obock|DJ|S0
OBD|Obano Airport|Obano|ID|S0
OBE|Okeechobee County Airport|Okeechobee|US|S0
OBF|Oberpfaffenhofen Airport|Weßling|DE|M0
OBI|Óbidos Municipal Airport|Óbidos|BR|S0
OBL|Oostmalle Airfield|Zoersel|BE|S0
OBM|Morobe Airport|Morobe|PG|S0
OBN|Oban Airport|North Connel|GB|S1
OBO|Tokachi-Obihiro Airport|Obihiro|JP|M1
OBS|Aubenas-South Ardèche Airport|Lanas, Ardèche|FR|M0
OBU|Kobuk Airport|Kobuk|US|S1
OBX|Obo Airport|Obo|PG|S1
OCA|Ocean Reef Club Airport|Key Largo|US|M0
OCC|Francisco De Orellana Airport|Coca|EC|M1
OCE|Ocean City Municipal Airport|Ocean City|US|M1
OCF|Ocala International Airport - Jim Taylor Field|Ocala|US|S0
OCH|A L Mangham Jr. Regional Airport|Nacogdoches|US|S0
OCJ|Ian Fleming International Airport|Boscobel|JM|M1
OCM|Boolgeeda||AU|S0
OCN|Oceanside Municipal Airport|Oceanside|US|M0
OCS|Corisco International Airport|Corisco Island|GQ|L1
OCV|Aguas Claras Airport|Ocaña|CO|M0
OCW|Warren Field|Washington|US|S0
ODA|Ouadda Airport|Ouadda|CF|S0
ODB|Córdoba Airport|Córdoba|ES|M1
ODC|Oakdale Airport|Oakdale|US|S0
ODD|Oodnadatta Airport||AU|S0
ODE|Odense Hans Christian Andersen Airport|Odense|DK|L1
ODH|RAF Odiham|Hook, Hampshire|GB|M0
ODJ|Ouanda Djallé Airport|Ouanda Djallé|CF|S0
ODL|Cordillo Downs Airport|Cordillo Downs|AU|S0
ODM|Garrett County Airport|Accident|US|S0
ODN|Long Seridan Airport|Long Seridan|MY|S1
ODO|Bodaybo Airport|Bodaybo|RU|S1
ODR|Ord River Airport|Ord River|AU|S0
ODS|Odesa International Airport|Odesa|UA|L0
ODT|Odessa Schlemeyer Field|Odessa|US|S0
ODW|AJ Eisenberg Airport|Oak Harbor|US|S0
ODY|Oudomsay Airport|Oudomsay|LA|S1
OEA|O'Neal Airport|Lawrenceville|US|S0
OEC|Oecusse Route of the Sandalwood International Airport|Oecussi-Ambeno|TL|L1
OEM|Vincent Fayks Airport|Paloemeu|SR|S0
OEO|L O Simenstad Municipal Airport|Osceola|US|S0
OER|Örnsköldsvik Airport|Örnsköldsvik|SE|M1
OES|Antoine de Saint Exupéry Airport|San Antonio Oeste|AR|S1
OFF|Offutt Air Force Base|Omaha|US|M0
OFI|Ouango Fitini Airport|Ouango Fitini|CI|S0
OFK|Karl Stefan Memorial Airport|Norfolk|US|M0
OFU|Ofu Airport|Ofu|AS|S1
OGA|Ogallala Municipal Airport Searle Field|Ogallala|US|S0
OGB|Orangeburg Municipal Airport|Orangeburg|US|M0
OGD|Ogden Hinckley Airport|Ogden|US|M1
OGE|Ogeranang Airport||PG|S0
OGG|Kahului International Airport|Kahului|US|L1
OGL|Eugene F. Correia International Airport|Ogle|GY|M1
OGM|Ogobsucum Airport|Ustupu|PA|S0
OGN|Yonaguni Airport|Yonaguni|JP|M1
OGO|Abengourou Airport|Abengourou|CI|S0
OGR|Bongor Airport|Bongor|TD|S0
OGS|Ogdensburg International Airport|Ogdensburg|US|M1
OGU|Ordu–Giresun Airport|Ordu|TR|M1
OGX|Ain Beida Airport|Ouargla|DZ|M1
OGZ|Vladikavkaz Beslan International Airport|Beslan|RU|M1
OHA|RNZAF Base Ohakea||NZ|M0
OHB|Ambohibary Airport|Moramanga|MG|S0
OHD|Ohrid St. Paul the Apostle Airport|Ohrid|MK|L1
OHE|Mohe Gulian Airport|Mohe|CN|M1
OHH|Okha Airport|Okha|RU|S0
OHI|Oshakati Airport|Oshakati|NA|S0
OHO|Okhotsk Airport|Okhotsk|RU|M1
OHR|Wyk auf Föhr Airport|Wyk auf Föhr|DE|S0
OHS|Suhar International Airport|Suhar|OM|L1
OHT|Kohat Airport|Kohat|PK|S0
OIA|Ourilândia do Norte Airport|Ourilândia do Norte|BR|S0
OIC|Lt Warren Eaton Airport|Norwich|US|S0
OIM|Oshima Airport|Izu Oshima|JP|M1
OIR|Okushiri Airport|Okushiri Island|JP|M1
OIT|Oita Airport|Oita|JP|M1
OJC|Johnson County Executive Airport|Olathe|US|S0
OJU|Tanjung Api Airport|Tojo Una-Una|ID|S1
OKA|Naha International Airport|Naha|JP|L1
OKB|Orchid Beach Airport|Orchid Beach|AU|S0
OKC|OKC Will Rogers World Airport|Oklahoma City|US|L1
OKD|Sapporo Okadama Airport|Sapporo|JP|M1
OKE|Okinoerabu Airport|Wadomari|JP|M1
OKF|Okaukuejo Airport|Okaukuejo|NA|S0
OKG|Okoyo Airport|Okoyo|CG|S0
OKI|Oki Global Geopark Airport|Okinoshima|JP|M1
OKJ|Okayama Momotaro Airport|Okayama|JP|L1
OKK|Kokomo Municipal Airport|Kokomo|US|S0
OKL|Oksibil Airport|Oksibil|ID|M1
OKM|Okmulgee Regional Airport|Okmulgee|US|S0
OKN|Okondja Airport|Okondja|GA|M0
OKO|Yokota Air Base|Fussa|JP|M0
OKP|Oksapmin Airport|Oksapmin|PG|S0
OKQ|Okaba Airport|Okaba|ID|S0
OKR|Yorke Island Airport|Yorke Island|AU|S1
OKS|Garden County Airport/King Rhiley Field|Oshkosh|US|S0
OKT|Oktyabrskiy Airport|Kzyl-Yar|RU|S0
OKU|Mokuti Lodge Airport|Mokuti Lodge|NA|S0
OKV|Okao Airport|Okao|PG|S0
OKY|Oakey Army Aviation Centre||AU|M1
OLA|Ørland Airport|Ørland|NO|M1
OLB|Olbia Costa Smeralda Airport|Olbia (SS)|IT|L1
OLC|Senadora Eunice Micheles Airport|São Paulo De Olivença|BR|S0
OLD|Dewitt Field - Old Town Municipal Airport|Old Town|US|S0
OLE|Cattaraugus County-Olean Airport|Olean|US|S0
OLF|L M Clayton Airport|Wolf Point|US|M1
OLG|Olare Orok Airfield|Mara|KE|S0
OLH|Old Harbor Airport|Old Harbor|US|S1
OLI|Rif Airport|Rif|IS|S0
OLJ|North West Santo Airport|Olpoi|VU|S1
OLK|Fuerte Olimpo Airport|Fuerte Olimpo|PY|S0
OLL|Oyo Ollombo Airport|Oyo|CG|M0
OLM|Olympia Regional Airport|Olympia|US|M1
OLN|Lago Musters Airport|Sarmiento|AR|S0
OLO|Olomouc Airport|Olomouc|CZ|S0
OLP|Olympic Dam Airport|Olympic Dam|AU|S1
OLQ|Olsobip Airport|Olsobip|PG|S0
OLR|Salerno Airport|Khost|AF|S0
OLS|Nogales International Airport|Nogales|US|M0
OLU|Columbus Municipal Airport|Columbus|US|M0
OLV|Olive Branch Airport|Olive Branch|US|S0
OLX|Mara-Olkiombo Airport|Serena|KE|S0
OLY|Olney Noble Airport|Olney-Noble|US|S0
OLZ|Olyokminsk Airport|Olyokminsk|RU|M1
OMA|Eppley Airfield|Omaha|US|L1
OMB|Omboue Hospital Airport|Omboue|GA|M0
OMC|Ormoc Airport|Ormoc City|PH|M0
OMD|Oranjemund Airport|Oranjemund|NA|M1
OME|Nome Airport|Nome|US|M1
OMF|King Hussein Air College|Mafraq|JO|S0
OMG|Omega Airport|Omega|NA|S0
OMH|Urmia Airport|Urmia|IR|M1
OMI|Omidiyeh Airport|Omidiyeh|IR|S0
OMJ|JMSDF Omura Air Base|Nagasaki|JP|S0
OMK|Omak Airport|Omak|US|S0
OMM|Marmul Airport|Marmul|OM|S0
OMN|Zomin Airport|Zomin|UZ|M1
OMO|Mostar International Airport|Mostar|BA|L1
OMR|Oradea International Airport|Oradea|RO|L1
OMS|Omsk Central Airport|Omsk|RU|L1
OMY|Preah Vinhear Airport|Tbeng Meanchey|KH|S0
ONA|Winona Municipal Airport Max Conrad Field|Winona|US|S0
ONB|Ononge Airport|Onange Mission|PG|S0
OND|Ondangwa Airport|Ondangwa|NA|M1
ONG|Mornington Island Airport||AU|S1
ONH|Albert S Nader Regional Airport|Oneonta|US|S0
ONI|Moanamani Airport|Moanamani|ID|S0
ONJ|Odate Noshiro Airport|Kitaakita|JP|M1
ONK|Olenyok Airport|Olenyok|RU|S0
ONL|O'Neill Municipal Airport–John L Baker Field|O'Neill|US|S0
ONM|Socorro Municipal Airport|Socorro|US|S0
ONO|Ontario Municipal Airport|Ontario|US|M0
ONP|Newport Municipal Airport|Newport|US|M0
ONQ|Zonguldak Çaycuma Airport|Zonguldak|TR|M1
ONR|Monkira Airport||AU|S0
ONS|Onslow Airport||AU|S0
ONT|Ontario International Airport|Ontario|US|L1
ONU|Ono-i-Lau Airport|Ono-i-Lau|FJ|S0
ONX|Enrique Adolfo Jimenez Airport|Colón|PA|M1
ONY|Olney Municipal Airport|Olney|US|S0
OOA|Oskaloosa Municipal Airport|Cedar|US|S0
OOD|Koodaideri Mine Airport|Koodaideri Mine|AU|S0
OOK|Toksook Bay Airport|Toksook Bay|US|S1
OOL|Gold Coast Airport|Gold Coast|AU|L1
OOM|Cooma Snowy Mountains Airport|Cooma|AU|M1
OOR|Mooraberree Airport||AU|S0
OOT|Onotoa Airport|Onotoa|KI|S0
OPA|Kópasker Airport|Kópasker|IS|S0
OPB|Open Bay Airport|Maitanakunai|PG|S0
OPF|Miami-Opa Locka Executive Airport|Miami|US|M1
OPI|Oenpelli Airport||AU|S0
OPL|St Landry Parish Ahart Field|Opelousas|US|S0
OPO|Francisco de Sá Carneiro Airport|Porto|PT|L1
OPP|Salinópolis Airport|Salinópolis|BR|S1
OPS|Presidente João Batista Figueiredo Airport|Sinop|BR|S1
OPU|Balimo Airport|Balimo|PG|M1
OPW|Opuwa Airport|Opuwa|NA|S0
OQN|Kokand Airport|Kokand|UZ|S0
ORA|Orán Airport|Orán|AR|M0
ORB|Örebro Airport|Örebro|SE|M1
ORC|Orocue Airport|Orocue|CO|S0
ORD|Chicago O'Hare International Airport|Chicago|US|L1
ORE|Orléans–Saint-Denis-de-l'Hôtel Airport|Saint-Denis-de-l'Hôtel, Loiret|FR|S0
ORF|Norfolk International Airport|Norfolk|US|L1
ORG|Zorg en Hoop Airport|Paramaribo|SR|S1
ORH|Worcester Regional Airport|Worcester|US|M1
ORI|Port Lions Airport|Port Lions|US|S1
ORJ|Orinduik Airport|Orinduik|GY|S0
ORK|Cork International Airport|Cork|IE|L1
ORL|Orlando Executive Airport|Orlando|US|M0
ORM|Sywell Aerodrome|Northampton, Northamptonshire|GB|S0
ORN|Oran Es-Sénia (Ahmed Ben Bella) International Airport|Es-Sénia|DZ|L1
ORO|Yoro Airport|Yoro|HN|S0
ORP|Orapa Airport|Orapa|BW|S0
ORR|Yorketown Airport||AU|S0
ORT|Northway Airport|Northway|US|M1
ORU|Juan Mendoza International Airport|Oruro|BO|L1
ORV|Robert (Bob) Curtis Memorial Airport|Noorvik|US|S1
ORW|Ormara Airport|Ormara Raik|PK|S0
ORX|Oriximiná Airport|Oriximiná|BR|S0
ORY|Paris-Orly Airport|Paris (Orly, Val-de-Marne)|FR|L1
ORZ|H.E Alfredo Martinez (Tower Hill) Airstrip|Orange Walk|BZ|S1
OSB|Grand Glaize Osage Beach Airport|Osage Beach|US|S0
OSC|Oscoda Wurtsmith Airport|Oscoda|US|S0
OSD|Åre Östersund Airport|Östersund|SE|M1
OSE|Omora Airport|Omora|PG|S0
OSG|Ossima Airport|Ossima|PG|S0
OSH|Wittman Regional Airport|Oshkosh|US|M0
OSI|Osijek Airport|Osijek(Klisa)|HR|M1
OSJ|Ol Seki Naboisho Airstrip|Mara Simba|KE|S0
OSK|Oskarshamn Airport|Oskarshamn|SE|S0
OSL|Oslo-Gardermoen International Airport|Oslo (Gardermoen)|NO|L1
OSM|Mosul International Airport|Mosul|IQ|L0
OSN|Osan Air Base|Pyeongtaek|KR|M0
OSO|Osborne Mine Airport||AU|S0
OSR|Leoš Janáček Airport Ostrava|Mošnov|CZ|L1
OSS|Osh International Airport|Osh|KG|L1
OST|Ostend-Bruges International Airport|Oostende|BE|L1
OSU|The Ohio State University Airport - Don Scott Field|Columbus|US|M0
OSW|Orsk Airport|Orsk|RU|M1
OSX|Kosciusko Attala County Airport|Kosciusko|US|S0
OSY|Namsos Airport|Namsos|NO|S1
OTC|Bol-Berim Airport|Bol|TD|S0
OTD|Raul Arias Espinoza Airport|Contadora Island|PA|S1
OTG|Worthington Municipal Airport|Worthington|US|S0
OTH|Southwest Oregon Regional Airport|North Bend|US|M1
OTI|Pitu Airport|Gotalalamo-Morotai Island|ID|M0
OTJ|Otjiwarongo Airport|Otjiwarongo|NA|S0
OTK|Tillamook Airport|Tillamook|US|S0
OTL|Boutilimit Airport|Boutilimit|MR|S0
OTM|Ottumwa Regional Airport|Ottumwa|US|M0
OTN|Ed-Air Airport|Oaktown|US|S0
OTO|Otog Banner Wulan Airport|Wulan|CN|S0
OTP|Bucharest Henri Coandă International Airport|Otopeni|RO|L1
OTQ|Otog Front Banner Oljoq Airport|Otog Front Banner|CN|S0
OTR|Coto 47 Airport|Corredores|CR|M0
OTS|Anacortes Airport|Anacortes|US|S1
OTT|Andre Maggi Airport|Cotriguaçu|BR|S0
OTU|Otu Airport|Remedios|CO|S0
OTZ|Ralph Wien Memorial Airport|Kotzebue|US|M1
OUA|Ouagadougou Thomas Sankara International Airport|Ouagadougou|BF|L1
OUD|Oujda Angads Airport|Ahl Angad|MA|L1
OUE|Ouesso Airport||CG|M0
OUG|Ouahigouya Airport|Ouahigouya|BF|S0
OUH|Oudtshoorn Airport|Oudtshoorn|ZA|M0
OUI|Ouessant Airport|Ushant|FR|S1
OUL|Oulu Airport|Oulu / Oulunsalo|FI|L1
OUM|Oum Hadjer Airport|Oum Hadjer|TD|S0
OUN|University of Oklahoma Westheimer Airport|Norman|US|S0
OUR|Batouri Airport|Batouri|CM|S0
OUS|Jornalista Benedito Pimentel Airport|Ourinhos|BR|S0
OUT|Bousso Airport|Bousso|TD|S0
OUZ|Tazadit Airport|Zouérate|MR|M1
OVA|Bekily Airport|Bekily|MG|S0
OVB|Novosibirsk Tolmachevo Airport|Novosibirsk|RU|L1
OVD|Asturias Airport|Ranón|ES|L1
OVE|Oroville Municipal Airport|Oroville|US|S0
OVG|Overberg Airport|Overberg|ZA|S0
OVL|El Tuqui Airport|Ovalle|CL|S0
OVR|Olavarria Airport|Olavarria|AR|S0
OVS|Sovetskiy Airport|Sovetskiy|RU|M1
OWA|Owatonna Degner Regional Airport|Owatonna|US|S0
OWB|Owensboro Daviess County Airport|Owensboro|US|M1
OWD|Norwood Memorial Airport|Norwood|US|M0
OWK|Central Maine/Norridgewock Airport|Norridgewock|US|S0
OXB|Osvaldo Vieira International Airport|Bissau|GW|L1
OXC|Waterbury Oxford Airport|Oxford|US|S0
OXD|Miami University Airport|Oxford|US|S0
OXF|London Oxford Airport|Kidlington, Oxfordshire|GB|M0
OXO|Orientos Airport|Orientos|AU|S0
OXR|Oxnard Airport|Oxnard|US|M0
OXY|Morney Airport||AU|S0
OYA|Goya Airport|Goya|AR|M0
OYC|Camopi Airport|Camopi|GF|S0
OYE|Oyem Airport|Oyem|GA|M1
OYG|Moyo Airport|Moyo|UG|S0
OYK|Oiapoque Airport|Oiapoque|BR|M0
OYL|Moyale Airport|Moyale|KE|S0
OYN|Ouyen Airport|Ouyen|AU|S0
OYO|Tres Arroyos Airport|Tres Arroyos|AR|M0
OYP|Saint-Georges-de-l'Oyapock Airport|Saint-Georges-de-l'Oyapock|GF|M0
OZA|Ozona Municipal Airport|Ozona|US|S0
OZC|Labo Airport|Ozamiz|PH|M1
OZG|Zagora Airport|Zagora|MA|L1
OZH|Zaporizhzhia International Airport|Zaporizhia|UA|M0
OZP|Moron Air Base|Morón|ES|M0
OZR|Cairns AAF (Fort Rucker) Air Field|Fort Rucker/Ozark|US|M0
OZZ|Ouarzazate International Airport|Ouarzazate|MA|L1
PAA|Hpa-N Airport|Hpa-N|MM|S0
PAB|Bilaspur Airport|Bilaspur|IN|M1
PAC|Marcos A. Gelabert International Airport|Albrook|PA|M1
PAD|Paderborn Lippstadt Airport|Büren|DE|L1
PAE|Seattle Paine Field International Airport|Everett|US|M1
PAF|Pakuba Airport|Pakuba|UG|S0
PAG|Pagadian Airport|Pagadian|PH|M1
PAH|Barkley Regional Airport|Paducah|US|M1
PAJ|Parachinar Airport|Parachinar|PK|S0
PAK|Port Allen Airport|Hanapepe|US|S0
PAL|German Olano Air Base|La Dorada|CO|M0
PAM|Tyndall Air Force Base|Panama City|US|M0
PAN|Pattani Airport||TH|M0
PAO|Palo Alto Airport|Palo Alto|US|M0
PAP|Toussaint Louverture International Airport|Port-au-Prince|HT|L1
PAQ|Warren "Bud" Woods Palmer Municipal Airport|Palmer|US|M0
PAS|Paros National Airport|Paros|GR|S1
PAT|Jay Prakash Narayan Airport|Patna|IN|M1
PAU|Pauk Airport|Pauk|MM|S0
PAV|Paulo Afonso Airport|Paulo Afonso|BR|M1
PAW|Pambwa Airstrip|Pambwa Station|PG|S0
PAX|Port-de-Paix Airport|Port-de-Paix|HT|M0
PAY|Pamol Airport|Pamol|MY|S0
PAZ|El Tajín National Airport|Poza Rica|MX|M1
PBA|Fábio Perini Airport|Cairu|BR|S0
PBB|Paranaíba Airport|Paranaíba|BR|S0
PBC|Hermanos Serdán International Airport|Puebla|MX|L1
PBD|Porbandar Airport|Porbandar|IN|M1
PBE|Puerto Berrio Airport|Puerto Berrio|CO|S0
PBF|Pine Bluff Regional Airport, Grider Field|Pine Bluff|US|M0
PBG|Plattsburgh International Airport|Plattsburgh|US|M1
PBH|Paro International Airport|Paro|BT|L1
PBJ|Tavie Airport|Paama Island|VU|S1
PBL|General Bartolome Salom International Airport|Puerto Cabello|VE|M0
PBM|Johan Adolf Pengel International Airport|Paramaribo|SR|L1
PBN|Porto Amboim Airport|Port Amboim|AO|M0
PBO|Paraburdoo Airport|Paraburdoo|AU|M1
PBP|Islita Airport|Nandayure|CR|S0
PBQ|Pimenta Bueno Airport|Pimenta Bueno|BR|S0
PBR|Puerto Barrios Airport|Puerto Barrios|GT|M1
PBT|Puerto Leda Airport|Puerto Leda|PY|S0
PBU|Putao Airport|Putao|MM|M1
PBX|Fazenda Piraguassu Airport|Porto Alegre do Norte|BR|S0
PBZ|Plettenberg Bay Airport|Plettenberg Bay|ZA|M0
PCA|Portage Creek Airport|Portage Creek|US|S0
PCB|Pondok Cabe Air Base|Jakarta|ID|S0
PCC|Puerto Rico Airport|Puerto Rico|CO|S0
PCD|Prairie Du Chien Municipal Airport|Prairie Du Chien|US|S0
PCF|Potchefstroom Airport|Potchefstroom|ZA|M0
PCG|Paso Caballos Airport|Paso Caballos|GT|S0
PCH|Palacios Airport|Palacios|HN|S0
PCJ|Puerto La Victoria Airport|Puerto La Victoria|PY|S0
PCL|Cap FAP David Abenzur Rengifo International Airport|Pucallpa|PE|L1
PCM|Playa del Carmen National Airport|Playa del Carmen|MX|S0
PCN|Picton Aerodrome|Koromiko|NZ|S1
PCO|Punta Colorada Airport|La Ribera|MX|S0
PCP|Principe Airport|São Tomé & Príncipe|ST|M1
PCQ|Boun Neau Airport|Phongsaly|LA|S0
PCR|German Olano Airport|Puerto Carreño|CO|M1
PCS|Picos Airport|Picos|BR|S0
PCT|Princeton Airport|Princeton/Rocky Hill|US|S0
PCU|Poplarville Pearl River County Airport|Poplarville|US|S0
PCV|Punta Chivato Airport|Mulegé|MX|S0
PDA|Obando Cesar Gaviria Trujillo Airport|Puerto Inírida|CO|M1
PDB|Pedro Bay Airport|Pedro Bay|US|S1
PDC|Mueo Airport|Népoui|NC|S0
PDD|Ponta do Ouro Airport|Ponta do Ouro|MZ|S0
PDE|Pandie Pandie Airport||AU|S0
PDF|Prado Airport|Prado|BR|S0
PDG|Minangkabau International Airport|Padang (Katapiang)|ID|L1
PDI|Pindiu Airport|Pindiu|PG|S0
PDK|DeKalb Peachtree Airport|Atlanta|US|M1
PDL|João Paulo II Airport|Ponta Delgada|PT|L1
PDM|Capt. J. Montenegro Airport|Pedasí|PA|S1
PDN|Parndana Airport|Kangaroo Island|AU|S0
PDO|Pendopo Airport|Talang Gudang-Sumatra Island|ID|M1
PDP|Capitan Corbeta CA Curbelo International Airport|Punta del Este|UY|M1
PDR|Presidente José Sarney Airport|Presidente Dutra|BR|S0
PDS|Piedras Negras International Airport|Piedras Negras|MX|M1
PDT|Eastern Oregon Regional Airport at Pendleton|Pendleton|US|M1
PDU|Tydeo Larre Borges Airport|Paysandú|UY|M0
PDV|Plovdiv International Airport|Plovdiv|BG|L1
PDX|Portland International Airport|Portland|US|L1
PDZ|Pedernales Airport|Capure|VE|S0
PEA|Penneshaw Airport|Ironstone|AU|S0
PEB|Pebane Airport|Pebane|MZ|S0
PED|Pardubice Airport|Pardubice|CZ|L1
PEE|Perm International Airport|Perm|RU|L1
PEF|Peenemünde Airport|Peenemünde|DE|S0
PEG|Perugia San Francesco d'Assisi – Umbria International Airport|Perugia (PG)|IT|L1
PEH|Comodoro Pedro Zanni Airport|Pehuajó|AR|M0
PEI|Matecaña International Airport|Pereira|CO|M1
PEK|Beijing Capital International Airport|Beijing|CN|L1
PEL|Pelaneng Airport|Pelaneng|LS|S0
PEM|Padre Aldamiz International Airport|Puerto Maldonado|PE|M1
PEN|Penang International Airport|Penang|MY|L1
PEP|Peppimenarti Airport|Peppimenarti|AU|S0
PEQ|Pecos Municipal Airport|Pecos|US|S0
PER|Perth International Airport|Perth|AU|L1
PES|Petrozavodsk Airport|Petrozavodsk|RU|M1
PET|João Simões Lopes Neto International Airport|Pelotas|BR|M1
PEU|Puerto Lempira Airport|Puerto Lempira|HN|S1
PEV|Pécs-Pogány International Airport|Pécs|HU|L1
PEW|Bacha Khan International Airport|Peshawar|PK|L1
PEX|Pechora Airport|Pechora|RU|M1
PEY|Penong Airport|Penong|AU|S0
PEZ|Penza Airport|Penza|RU|M1
PFA|Harbin Pingfang Airport|Harbin|CN|S0
PFB|Lauro Kurtz Airport|Passo Fundo|BR|M1
PFC|Pacific City State Airport|Pacific City|US|S0
PFM|Primrose Airport|Primrose|CA|S0
PFO|Paphos International Airport|Paphos|CY|L1
PFQ|Parsabad-Moghan Airport|Parsabad|IR|S1
PFR|Ilebo Airport|Ilebo|CD|S1
PGA|Page Municipal Airport|Page|US|M1
PGB|Pangoa Airport|Pangoa|PG|S0
PGC|Grant County Airport|Petersburg|US|S0
PGD|Punta Gorda Airport|Punta Gorda|US|M1
PGE|Yegepa Airport||PG|S0
PGF|Perpignan-Rivesaltes (Llabanère) Airport|Perpignan/Rivesaltes|FR|M1
PGH|Pantnagar Airport|Pantnagar|IN|M1
PGI|Chitato Airport|Chitato|AO|S0
PGK|Depati Amir Airport|Pangkal Pinang|ID|M1
PGL|Trent Lott International Airport|Pascagoula|US|S0
PGM|Port Graham Airport|Port Graham|US|S1
PGN|Pangia Airport|Pangia|PG|S0
PGO|Stevens Field|Pagosa Springs|US|S0
PGQ|Buli Airport|Pekaulang|ID|S0
PGR|Kirk Field|Paragould|US|S0
PGS|Grand Canyon Caverns Airport|Peach Springs|US|S0
PGU|Persian Gulf International Airport|Khiyaroo|IR|M1
PGV|Pitt-Greenville Airport|Greenville|US|M1
PGX|Périgueux-Bassillac Airport|Périgueux/Bassillac|FR|M0
PGZ|Ponta Grossa Airport - Comandante Antonio Amilton Beraldo|Ponta Grossa|BR|M1
PHA|Phan Rang Airport|Phan Rang|VN|S0
PHB|Parnaíba - Prefeito Doutor João Silva Filho International Airport|Parnaíba|BR|M1
PHC|Port Harcourt International Airport|Port Harcourt|NG|L1
PHD|Harry Clever Field|New Philadelphia|US|S0
PHE|Port Hedland International Airport|Port Hedland|AU|L1
PHF|Newport News Williamsburg International Airport|Newport News|US|M1
PHG|Port Harcourt City Airport / Port Harcourt Air Force Base|Port Harcourt|NG|M1
PHH|Pokhara International Airport|Pokhara|NP|L1
PHI|Pinheiro Airport|Pinheiro|BR|S0
PHK|Palm Beach County Glades Airport|Pahokee|US|S0
PHL|Philadelphia International Airport|Philadelphia|US|L1
PHN|St Clair County International Airport|Port Huron|US|S0
PHO|Point Hope Airport|Point Hope|US|S1
PHP|Philip Airport|Philip|US|S0
PHQ|The Monument Airport|Phosphate Hill|AU|S0
PHR|Nanuku Airport|Nanuku Auberge Resort|FJ|S0
PHS|Phitsanulok Airport|Phitsanulok|TH|M1
PHT|Henry County Airport|Paris|US|S0
PHW|Hendrik Van Eck Airport|Phalaborwa|ZA|M1
PHX|Phoenix Sky Harbor International Airport|Phoenix|US|L1
PHY|Phetchabun Airport||TH|M1
PIA|General Wayne A. Downing Peoria International Airport|Peoria|US|M1
PIB|Hattiesburg Laurel Regional Airport|Moselle|US|M1
PIC|Pine Cay Airport|Pine Cay|TC|S0
PIE|St. Petersburg Clearwater International Airport|Pinellas Park|US|L1
PIH|Pocatello Regional Airport|Pocatello|US|M1
PIK|Glasgow Prestwick Airport|Prestwick, South Ayrshire|GB|L1
PIL|Don Carlos Miguel Gimenez Airport|Pilar|PY|M0
PIM|Harris County Airport|Pine Mountain|US|S0
PIN|Parintins Airport|Parintins|BR|S0
PIO|Captain Renán Elías Olivera International Airport|Pisco|PE|L0
PIP|Pilot Point Airport|Pilot Point|US|S1
PIQ|Pipillipai Airport|Pipillipai|GY|S0
PIR|Pierre Regional Airport|Pierre|US|M1
PIS|Poitiers-Biard Airport|Poitiers/Biard|FR|M1
PIT|Pittsburgh International Airport|Pittsburgh|US|L1
PIU|PAF Captain Guillermo Concha Iberico International Airport|Piura|PE|M1
PIV|Pirapora Airport|Pirapora|BR|S0
PIW|Pikwitonei Airport|Pikwitonei|CA|M0
PIX|Pico Airport|Pico Island|PT|M1
PIZ|Point Lay LRRS Airport|Point Lay|US|M1
PJA|Pajala Airport|Pajala|SE|S1
PJB|Payson Airport|Payson|US|S0
PJC|Dr. Augusto Roberto Fuster International Airport|Pedro Juan Caballero|PY|M0
PJG|Panjgur Airport|Panjgur|PK|M0
PJM|Puerto Jimenez Airport|Puerto Jimenez|CR|M1
PKA|Napaskiak Airport|Napaskiak|US|S1
PKB|Mid Ohio Valley Regional Airport|Parkersburg (Williamstown)|US|M1
PKC|Yelizovo Airport|Petropavlovsk-Kamchatsky|RU|L1
PKD|Park Rapids Municipal Airport Konshok Field|Park Rapids|US|S0
PKE|Parkes Airport|Parkes|AU|M1
PKF|Park Falls Municipal Airport|Park Falls|US|S0
PKG|Pulau Pangkor Airport|Pangkor Island|MY|S1
PKJ|Playa Grande Airport|Playa Grande|GT|S0
PKK|Pakhokku Airport|Pakhokku|MM|S0
PKM|Port Kaituma Airport|Port Kaituma|GY|S0
PKN|Iskandar Airport|Pangkalanbun|ID|S1
PKO|Parakou Airport|Parakou|BJ|S0
PKP|Puka Puka Airport||PF|S1
PKR|Pokhara Domestic Airport|Pokhara|NP|M1
PKT|Port Keats Airport|Wadeye|AU|M0
PKU|Sultan Syarif Kasim II International Airport / Roesmin Nurjadin AFB|Pekanbaru|ID|M1
PKV|Princess Olga Pskov International Airport|Pskov|RU|M1
PKW|Selebi Phikwe Airport|Selebi Phikwe|BW|M0
PKX|Beijing Daxing International Airport|Beijing|CN|L1
PKY|Tjilik Riwut Airport|Palangkaraya|ID|M1
PKZ|Pakse International Airport|Pakse|LA|L1
PLA|Planadas Airport|Planadas|CO|S0
PLD|Playa Samara/Carrillo Airport|Carrillo|CR|S0
PLE|Paiela Airport|Paiela|PG|S0
PLF|Pala Airport|Pala|TD|S0
PLJ|Placencia Airport|Placencia|BZ|M1
PLK|M. Graham Clark Downtown Airport|Branson / Hollister|US|S0
PLL|Ponta Pelada Airport / Manaus Air Base|Manaus|BR|M0
PLM|Sultan Mahmud Badaruddin II Airport|Palembang|ID|M1
PLN|Pellston Regional Airport of Emmet County Airport|Pellston|US|M1
PLO|Port Lincoln Airport|Port Lincoln|AU|M1
PLQ|Palanga International Airport|Palanga|LT|L1
PLR|St Clair County Airport|Pell City|US|S0
PLS|Providenciales International Airport|Providenciales|TC|L1
PLT|Plato Airport|Plato|CO|S0
PLU|Pampulha - Carlos Drummond de Andrade Airport|Belo Horizonte|BR|M0
PLV|Suprunovka Airport|Poltava|UA|M0
PLW|Mutiara - SIS Al-Jufrie Airport|Palu|ID|M1
PLX|Semei International Airport|Semey|KZ|L1
PLY|Plymouth Municipal Airport|Plymouth|US|S0
PLZ|Chief Dawid Stuurman International Airport|Gqeberha (Port Elizabeth)|ZA|L1
PMA|Pemba Airport|Chake Chake|TZ|M0
PMB|Pembina Municipal Airport|Pembina|US|S0
PMC|El Tepual International Airport|Puerto Montt|CL|L1
PMD|Palmdale Regional Airport / USAF Plant 42 Airport|Palmdale|US|M0
PMF|Parma Airport|Parma (PR)|IT|M1
PMG|Ponta Porã Airport|Ponta Porã|BR|M1
PMH|Greater Portsmouth Regional Airport|Portsmouth|US|S0
PMI|Palma de Mallorca Airport|Palma de Mallorca|ES|L1
PMK|Palm Island Airport||AU|S1
PML|Port Moller Airport|Cold Bay|US|S0
PMN|Pumani Airport|Pumani|PG|S0
PMO|Falcone–Borsellino Airport|Palermo|IT|L1
PMP|Pimaga Airport|Pimaga|PG|S0
PMQ|Perito Moreno Jalil Hamer Airport|Perito Moreno|AR|M1
PMR|Palmerston North Airport|Palmerston North|NZ|M1
PMS|Palmyra Airport|Tadmur|SY|M0
PMT|Paramakatoi Airport|Paramakatoi|GY|S0
PMV|Del Caribe Santiago Mariño International Airport|Isla Margarita|VE|L1
PMW|Brigadeiro Lysias Rodrigues Airport|Palmas|BR|M1
PMY|El Tehuelche Airport|Puerto Madryn|AR|M1
PMZ|Palmar Sur Airport|Palmar Sur|CR|M0
PNA|Pamplona Airport|Pamplona|ES|M1
PNB|Porto Nacional Airport|Porto Nacional|BR|M0
PNC|Ponca City Regional Airport|Ponca City|US|M0
PND|Punta Gorda Airport|Punta Gorda|BZ|S1
PNE|Northeast Philadelphia Airport|Philadelphia|US|M0
PNG|Paranaguá Airport|Paranaguá|BR|S0
PNH|Phnom Penh International Airport|Phnom Penh (Pou Senchey)|KH|L0
PNI|Pohnpei International Airport|Pohnpei Island|FM|M1
PNJ|Penglai Shahekou Airport|Yantai|CN|S0
PNK|Supadio International Airport|Pontianak|ID|L1
PNL|Pantelleria Airport|Pantelleria (TP)|IT|M1
PNN|Princeton Municipal Airport|Princeton|US|S0
PNP|Girua Airport|Popondetta|PG|M1
PNQ|Pune International Airport|Pune|IN|L1
PNR|Antonio Agostinho-Neto International Airport|Pointe Noire|CG|L1
PNS|Pensacola International Airport|Pensacola|US|L1
PNT|Lieutenant Julio Gallardo Airport|Puerto Natales|CL|M1
PNU|Panguitch Municipal Airport|Panguitch|US|S0
PNV|Panevėžys Air Base|Panevėžys|LT|M0
PNX|North Texas Regional Airport Perrin Field|Denison|US|M0
PNY|Pondicherry Airport|Puducherry (Pondicherry)|IN|M1
PNZ|Senador Nilo Coelho Airport|Petrolina|BR|M1
POA|Porto Alegre-Salgado Filho International Airport|Porto Alegre|BR|L1
POB|Pope Field|Fort Bragg|US|M0
POC|Brackett Field|La Verne|US|S0
POD|Podor Airport|Podor|SN|S0
POE|Polk Army Air Field|Fort Polk|US|M0
POF|Poplar Bluff Municipal Airport|Poplar Bluff|US|S0
POG|Port Gentil International Airport|Port Gentil|GA|L1
POH|Pocahontas Municipal Airport|Pocahontas|US|S0
POI|Capitan Nicolas Rojas Airport|Potosí|BO|M0
POJ|Patos de Minas Airport|Patos de Minas|BR|S0
POL|Pemba Airport|Pemba|MZ|M1
POM|Port Moresby Jacksons International Airport|Port Moresby|PG|L1
PON|Poptún Airport|Poptún|GT|S0
POO|Poços de Caldas - Embaixador Walther Moreira Salles Airport|Poços De Caldas|BR|M0
POP|Gregorio Luperon International Airport|Puerto Plata|DO|M1
POR|Pori Airport|Pori|FI|M1
POS|Piarco International Airport|Port of Spain|TT|L1
POT|Ken Jones Airport|Ken Jones|JM|M0
POU|Dutchess County Airport|Poughkeepsie|US|M0
POV|Prešov Air Base|Prešov|SK|S0
POW|Portorož Airport|Sečovlje|SI|M0
POX|Pontoise-Cormeilles Aerodrome|Cormeilles-en-Vexin, Val-d'Oise|FR|M0
POY|Powell Municipal Airport|Powell|US|S0
POZ|Poznań-Ławica Airport|Poznań|PL|L1
PPA|Perry Lefors Field|Pampa|US|S0
PPB|Presidente Prudente Airport|Presidente Prudente|BR|M1
PPC|Prospect Creek Airport|Prospect Creek|US|S0
PPE|Mar de Cortés International Airport|Puerto Peñasco|MX|S1
PPF|Tri-City Airport|Parsons|US|S0
PPG|Pago Pago International Airport|Pago Pago|AS|L1
PPH|Paraitepuy Airstrip|Paraitepuy de Ikabarú|VE|S0
PPI|Port Pirie Airport||AU|M0
PPJ|Pulau Panjang Airport|Jakarta|ID|S0
PPK|Petropavl International Airport|Petropavl|KZ|L1
PPL|Phaplu Airport|Phaplu|NP|S0
PPM|Pompano Beach Airpark|Pompano Beach|US|S0
PPN|Guillermo León Valencia Airport|Popayán|CO|M1
PPP|Proserpine Whitsunday Coast Airport|Proserpine|AU|M1
PPQ|Paraparaumu Airport||NZ|M0
PPR|Tuanku Tambusai Airport|Pasir Pengarayan|ID|S0
PPS|Puerto Princesa International Airport / PAF Antonio Bautista Air Base|Puerto Princesa|PH|L1
PPT|Fa'a'ā International Airport|Papeete|PF|L1
PPU|Hpapun Airport|Pa Pun|MM|S0
PPW|Papa Westray Airport|Papa Westray, Orkney Islands|GB|S1
PPX|Param Airport|Nepesi|PG|S0
PPY|Pouso Alegre Airport|Pouso Alegre|BR|S0
PPZ|Puerto Paez Airport|Puerto Paez|VE|S0
PQC|Phú Quốc International Airport|Phu Quoc Island|VN|L1
PQI|Presque Isle International Airport|Presque Isle|US|M1
PQM|Palenque International Airport|Palenque|MX|S0
PQQ|Port Macquarie Airport|Port Macquarie|AU|M1
PQS|Pilot Station Airport|Pilot Station|US|S1
PRA|General Urquiza Airport|Parana|AR|M1
PRB|Paso Robles Municipal Airport|Paso Robles|US|M0
PRC|Prescott Regional Airport - Ernest A. Love Field|Prescott|US|M1
PRD|Pardoo Airport|Pardoo|AU|S0
PRE|Pore Airport|Pore|CO|S0
PRG|Václav Havel Airport Prague|Prague|CZ|L1
PRH|Phrae Airport||TH|M0
PRI|Praslin Island Airport|Praslin Island|SC|M1
PRK|Prieska Airport|Prieska|ZA|S0
PRM|Portimão Airport|Portimão|PT|M1
PRN|Priština Adem Jashari International Airport|Prishtina|XK|L1
PRO|Perry Municipal Airport|Perry|US|S0
PRP|Propriano Airport|Propriano|FR|S0
PRQ|Termal Airport|Presidencia Roque Sáenz Peña|AR|S0
PRR|Paruima Airport|Paruima|GY|S0
PRS|Parasi Airport|Parasi|SB|S0
PRU|Pyay Airport|Pye|MM|S0
PRV|Přerov Air Base|Přerov|CZ|M0
PRW|Prentice Airport|Prentice|US|S0
PRX|Cox Field|Paris|US|M0
PRY|Wonderboom Airport|Pretoria|ZA|M0
PRZ|Prineville Airport|Prineville|US|S0
PSA|Pisa International Airport|Pisa (PI)|IT|L1
PSB|Mid-State Regional Airport|Philipsburg|US|S0
PSC|Tri Cities Airport|Pasco|US|M1
PSD|Port Said International Airport|Port Said|EG|L1
PSE|Mercedita International Airport|Ponce|PR|M1
PSF|Pittsfield Municipal Airport|Pittsfield|US|S0
PSG|Petersburg James A Johnson Airport|Petersburg|US|M1
PSH|Sankt Peter-Ording Airport|Sankt Peter-Ording|DE|S0
PSI|Pasni Airport|Pasni|PK|M0
PSJ|Kasiguncu Airport|Poso-Celebes Island|ID|M0
PSK|New River Valley Airport|Dublin|US|S0
PSL|Perth/Scone Airport|Perth, Perth and Kinross|GB|S0
PSM|Portsmouth International Airport at Pease|Portsmouth|US|M1
PSN|Palestine Municipal Airport|Palestine|US|S0
PSO|Antonio Nariño Airport|Chachagüí|CO|M1
PSP|Palm Springs International Airport|Palm Springs|US|L1
PSR|Abruzzo Airport|Pescara|IT|L1
PSS|Libertador Gral D Jose De San Martin Airport|Posadas|AR|M1
PSU|Pangsuma Airport|Putussibau-Borneo Island|ID|M1
PSW|José Figueiredo Municipal Airport|Passos|BR|S0
PSX|Palacios Municipal Airport|Palacios|US|S0
PSY|Port Stanley Airport|Stanley|FK|S1
PSZ|Capitán Av. Salvador Ogaya G. airport|Puerto Suárez|BO|M1
PTA|Port Alsworth Airport|Port Alsworth|US|S1
PTB|Dinwiddie County Airport|Petersburg|US|S0
PTF|Malolo Lailai Island Airport|Malolo Lailai Island|FJ|S1
PTG|Polokwane International Airport|Polokwane|ZA|L1
PTH|Port Heiden Airport|Port Heiden|US|M1
PTJ|Portland Airport||AU|M1
PTK|Oakland County International Airport|Pontiac|US|M0
PTL|Walter Braedt Segú Airport|Máncora|PE|S0
PTM|Palmarito Airport|Palmarito|VE|M0
PTN|Harry P Williams Memorial Airport|Patterson|US|S0
PTO|Juvenal Loureiro Cardoso Airport|Pato Branco|BR|S1
PTP|Maryse Condé International Airport|Pointe-à-Pitre|GP|L1
PTQ|Porto de Moz Airport|Porto de Moz|BR|S0
PTS|Atkinson Municipal Airport|Pittsburg|US|S0
PTT|Pratt Regional Airport|Pratt|US|S0
PTU|Platinum Airport|Platinum|US|M1
PTV|Porterville Municipal Airport|Porterville|US|S0
PTW|Heritage Field|Pottstown|US|S0
PTX|Pitalito Airport|Pitalito|CO|M0
PTY|Tocumen International Airport|Tocumen|PA|L1
PTZ|Rio Amazonas Airport|Shell Mera|EC|S0
PUA|Puas Airport|Puas Mission|PG|S0
PUB|Pueblo Memorial Airport|Pueblo|US|M1
PUC|Carbon County Regional Airport / Buck Davis Field|Price|US|S0
PUD|Puerto Deseado Airport|Puerto Deseado|AR|M1
PUE|Puerto Obaldía Airport|Puerto Obaldía|PA|S0
PUF|Pau Pyrénées Airport|Pau/Pyrénées (Uzein)|FR|M1
PUG|Port Augusta Airport||AU|M1
PUJ|Punta Cana International Airport|Punta Cana|DO|L1
PUK|Pukaruha Airport|Pukaruha|PF|S0
PUN|Punia Airport|Punia|CD|S0
PUP|Po Airport|Po|BF|S0
PUQ|President Carlos Ibáñez International Airport|Punta Arenas|CL|L1
PUR|Puerto Rico Airport|Puerto Rico/Manuripi|BO|S1
PUS|Gimhae International Airport|Busan|KR|L1
PUT|Sri Sathya Sai Airport|Puttaparthi|IN|M0
PUU|Tres De Mayo Airport|Puerto Asís|CO|M1
PUV|Poum / Malabou Airport|Malabou|NC|S0
PUW|Pullman-Moscow Regional Airport|Pullman|US|M1
PUX|El Mirador Airport|Puerto Varas|CL|S0
PUY|Pula Airport|Pula|HR|L1
PUZ|Puerto Cabezas Airport|Puerto Cabezas|NI|M1
PVA|El Embrujo Airport|Providencia|CO|M1
PVC|Provincetown Municipal Airport|Provincetown|US|S0
PVD|Rhode Island T. F. Green International Airport|Providence/Warwick|US|L1
PVF|Placerville Airport|Placerville|US|S0
PVG|Shanghai Pudong International Airport|Shanghai (Pudong)|CN|L1
PVH|Governador Jorge Teixeira de Oliveira International Airport|Porto Velho|BR|L1
PVI|Paranavaí Airport|Paranavaí|BR|S0
PVK|Aktion National Airport|Preveza|GR|M1
PVL|Pike County Airport Hatcher Field|Pikeville|US|S0
PVO|Reales Tamarindos Airport|Portoviejo|EC|M0
PVR|Puerto Vallarta International Airport|Puerto Vallarta|MX|L1
PVS|Provideniya Bay Airport|Chukotka|RU|M0
PVU|Provo Municipal Airport|Provo|US|M1
PVW|Hale County Airport|Plainview|US|S0
PWA|Wiley Post Airport|Oklahoma City|US|S0
PWD|Sher-Wood Airport|Plentywood|US|S0
PWE|Pevek Airport|Apapelgino|RU|M1
PWI|Beles Airport|Pawe|ET|S0
PWK|Chicago Executive Airport|Chicago/Prospect Heights/Wheeling|US|M0
PWL|Jenderal Besar Soedirman Airport|Purwokerto-Java Island|ID|S0
PWM|Portland International Jetport|Portland|US|L1
PWN|Pitts Town Airport|Pitts Town|BS|S0
PWO|Pweto Airport|Pweto|CD|S0
PWQ|Pavlodar International Airport|Pavlodar|KZ|L1
PWT|Bremerton National Airport|Bremerton|US|M0
PWY|Ralph Wenz Field|Pinedale|US|M0
PXA|Atung Bungsu Airport|Bentayan|ID|S0
PXH|Prominent Hill Airport|Mount Eba|AU|S1
PXL|Polacca Airport|Polacca|US|S0
PXM|Puerto Escondido International Airport|Puerto Escondido|MX|M1
PXO|Porto Santo Airport|Vila Baleira|PT|M1
PXR|Surin Airport|Surin|TH|M1
PXU|Pleiku Airport|Pleiku|VN|M1
PYA|Velásquez Airport|Puerto Boyacá|CO|S0
PYB|Jeypore Airport|Jeypore|IN|S0
PYC|Playón Chico Airport|Ukupseni|PA|S0
PYE|Tongareva Airport|Penrhyn Island|CK|S0
PYG|Pakyong Airport|Pakyong|IN|S0
PYH|Cacique Aramare Airport|Puerto Ayacucho|VE|M0
PYJ|Polyarny Airport|Yakutia|RU|M1
PYK|Payam International Airport|Karaj|IR|L1
PYM|Plymouth Municipal Airport|Plymouth|US|S0
PYN|Payán Airport|Payán|CO|S0
PYO|Putumayo Airport|Puerto Putumayo|EC|S0
PYR|Andravida Air Base|Andravida|GR|M0
PYS|Paradise Skypark Airport|Paradise|US|S0
PYT|Pedro Rabelo de Souza Airport|Paracatu|BR|S1
PYV|Yaviza Airport|Yaviza|PA|S0
PYY|Pai Airport|Pai|TH|S0
PZA|Paz de Ariporo Airport|Paz de Ariporo|CO|M0
PZB|Pietermaritzburg Airport|Pietermaritzburg|ZA|M1
PZH|Zhob Airport|Fort Sandeman|PK|M1
PZI|Panzhihua Bao'anying Airport|Panzhihua (Renhe)|CN|M1
PZK|Pukapuka Island Airport|Pukapuka Atoll|CK|S0
PZL|Zulu Inyala Airport|Phinda|ZA|S0
PZO|General Manuel Carlos Piar International Airport|Guyana City|VE|L1
PZR|Pizarro Airport|Bajo Baudó|CO|S0
PZS|Maquehue Airport|Temuco|CL|M0
PZU|Port Sudan New International Airport|Port Sudan|SD|L1
PZY|Piešťany Airport|Piešťany|SK|M0
QBC|Bella Coola Airport|Bella Coola|CA|M1
QCH|Colatina Airport|Colatina|BR|S0
QCP|Currais Novos Airport|Currais Novos|BR|S0
QCY|RAF Coningsby|Lincoln, Lincolnshire|GB|M0
QDB|Cachoeira do Sul Airport|Cachoeira Do Sul|BR|S0
QDV|Comte. Rolim Adolfo Amaro–Jundiaí State Airport|Jundiaí|BR|S0
QGF|Montenegro Airport|Montenegro|BR|S0
QGP|Garanhuns Airport|Garanhuns|BR|S0
QGU|Gifu Airport|Gifu|JP|M0
QHR|Harar Meda Airport|Debre Zeyit|ET|M0
QHU|Husum-Schwesing Airport|Husum|DE|S0
QHV|Novo Hamburgo Airport|Novo Hamburgo|BR|S0
QIG|Iguatu Airport|Iguatu|BR|S0
QIT|Itapetinga Airport|Itapetinga|BR|S0
QJP|Pocheon (G-217) Airport|Pocheon|KR|S0
QMJ|Shahid Asiyaee Airport|Masjed Soleyman|IR|M0
QOW|Sam Mbakwe International Cargo Airport|Owerri|NG|M1
QPG|Paya Lebar Air Base|Paya Lebar|SG|M0
QRA|Rand Airport|Johannesburg|ZA|M0
QRF|Bragado Airport|Bragado|AR|S0
QRM|Narromine Airport||AU|M0
QRO|Querétaro Intercontinental Airport|Querétaro|MX|L1
QRW|Warri Airport|Okpe|NG|M1
QSC|Mário Pereira Lopes–São Carlos International Airport|São Carlos|BR|S0
QSF|Ain Arnat Airport|Sétif|DZ|M1
QSI|Moshi Airport|Moshi|TZ|S0
QSR|Salerno Costa d'Amalfi Airport|Salerno|IT|M1
QSX|New Amsterdam Airport|New Amsterdam|GY|S0
QSZ|Shache Airport|Shache|CN|M1
QUB|Ubari Airport|Ubari|LY|S0
QUG|Goodwood Aerodrome|Chichester, West Sussex|GB|S0
QUO|Akwa Ibom International Airport|Uyo|NG|M1
QUY|RAF Wyton|St Ives, Cambridgeshire|GB|S0
RAA|Rakanda Airport|Rakanda|PG|S0
RAB|Tokua Airport|Kokopo|PG|M1
RAC|John H Batten Airport|Racine|US|S0
RAE|Arar Domestic Airport|Arar|SA|M1
RAF|Rafaela Airport|Rafaela|AR|S0
RAG|Raglan Aerodrome|Raglan|NZ|S0
RAH|Rafha Domestic Airport|Rafha|SA|M1
RAI|Nelson Mandela International Airport|Praia|CV|L1
RAJ|Rajkot Airport|Rajkot|IN|M0
RAK|Marrakesh Menara Airport|Marrakesh|MA|L1
RAL|Riverside Municipal Airport|Riverside|US|M0
RAM|Ramingining Airport||AU|S1
RAN|Ravenna Airport|Ravenna (RA)|IT|S0
RAO|Leite Lopes Airport|Ribeirão Preto|BR|M1
RAP|Rapid City Regional Airport|Rapid City|US|M1
RAQ|Sugimanuru Airport|Raha|ID|S0
RAR|Rarotonga International Airport|Avarua|CK|L1
RAS|Sardar-e-Jangal Airport|Rasht|IR|M1
RAV|Cravo Norte Airport|Cravo Norte|CO|S0
RAW|Arawa Airport|Arawa|PG|S0
RAX|Oram Airport||PG|S0
RAZ|Rawalakot Airport|Rawalakot|PK|M0
RBA|Rabat-Salé Airport|Rabat|MA|L1
RBB|Borba Airport|Borba|BR|S1
RBC|Robinvale Airport|Robinvale|AU|S0
RBD|Dallas Executive Airport|Dallas|US|S0
RBE|Ratanakiri Airport|Ratanakiri|KH|M0
RBF|Big Bear City Airport|Big Bear|US|S0
RBG|Roseburg Regional Airport|Roseburg|US|S0
RBI|Rabi Island Airport|Rabi Island|FJ|S0
RBJ|Rebun Airport|Rebun|JP|S0
RBK|French Valley Airport|Murrieta|US|S0
RBL|Red Bluff Municipal Airport|Red Bluff|US|M0
RBM|Straubing Airport|Atting|DE|S0
RBO|Roboré Airport|Roboré|BO|S0
RBP|Raba Raba Airport|Rabaraba|PG|S0
RBQ|Rurrenabaque Airport|Rurrenabaque|BO|S1
RBR|Rio Branco-Plácido de Castro International Airport|Rio Branco|BR|L1
RBS|Orbost Airport||AU|S0
RBT|Marsabit Airport|Marsabit|KE|S0
RBU|Roebourne Airport|Roebourne|AU|S0
RBV|Ramata Airport|Ramata|SB|S1
RBW|Lowcountry Regional Airport|Walterboro|US|S0
RBX|Rumbek Airport|Rumbek|SS|S0
RBY|Ruby Airport|Ruby|US|M1
RBZ|Shahrisabz Southwest Airport|Shahrisabz|UZ|S0
RCA|Ellsworth Air Force Base|Rapid City|US|M0
RCB|Richards Bay Airport|Richards Bay|ZA|M1
RCE|Roche Harbor Airport|Roche Harbor|US|S1
RCH|Almirante Padilla Airport|Riohacha|CO|M1
RCK|H H Coffield Regional Airport|Rockdale|US|S0
RCL|Redcliffe Airport|Redcliffe|VU|S0
RCM|Richmond Airport||AU|S1
RCO|Rochefort-Saint-Agnant (BA 721) Airport|Rochefort/Saint-Agnant|FR|M0
RCQ|Reconquista Airport|Reconquista|AR|M0
RCR|Fulton County Airport|Rochester|US|S0
RCS|Rochester Airport|Rochester, Kent|GB|S0
RCU|Area De Material Airport|Rio Cuarto|AR|M0
RCY|Rum Cay International Airport|Port Nelson|BS|S0
RDA|Rockhampton Downs Airport|Rockhampton Downs|AU|S0
RDB|Red Dog Airport|Red Dog|US|S0
RDC|Redenção Airport|Redenção|BR|S0
RDD|Redding Municipal Airport|Redding|US|M1
RDE|Merdey Airport|Merdei-Papua Island|ID|S0
RDG|Reading Regional Airport (Carl A Spaatz Field)|Reading|US|M0
RDL|Bardawil International Airport|El Hassana|EG|M0
RDM|Roberts Field|Redmond|US|M1
RDN|LTS Pulau Redang Airport|Redang|MY|S0
RDO|Warsaw Radom Airport|Radom|PL|M1
RDP|Kazi Nazrul Islam Airport|Durgapur|IN|M1
RDR|Grand Forks Air Force Base|Grand Forks|US|M0
RDS|Rincon De Los Sauces Airport|Rincon de los Sauces|AR|M0
RDT|Richard Toll Airport|Richard Toll|SN|S0
RDU|Raleigh-Durham International Airport|Raleigh/Durham|US|L1
RDV|Red Devil Airport|Red Devil|US|S1
RDZ|Rodez–Aveyron Airport|Rodez/Marcillac|FR|M1
REA|Reao Airport|Reao|PF|M0
REB|Müritz Airpark|Lärz|DE|S0
REC|Recife/Guararapes - Gilberto Freyre International Airport|Recife|BR|L1
RED|Mifflin County Airport|Reedsville|US|S0
REE|Reese Airpark|Lubbock|US|S0
REG|Reggio Calabria Airport|Reggio Calabria|IT|M1
REI|Régina Airport|Régina|GF|S0
REL|Almirante Marco Andres Zar Airport|Rawson|AR|M1
REN|Orenburg Central Airport|Orenburg|RU|M1
REO|Rome State Airport|Rome|US|S0
REQ|Reko Diq Airport|Chagai|PK|S0
RER|Retalhuleu Airport|Retalhuleu|GT|M1
RES|Resistencia International Airport|Resistencia|AR|L1
RET|Røst Airport|Røst|NO|S1
REU|Reus Airport|Reus|ES|L1
REW|Rewa Airport, Chorhata, REWA|Rewa|IN|M1
REX|General Lucio Blanco International Airport|Reynosa|MX|M1
REY|Reyes Airport|Reyes|BO|S0
REZ|Resende Airport|Resende|BR|S0
RFA|Rafaï Airport|Rafaï|CF|S0
RFD|Chicago Rockford International Airport|Chicago/Rockford|US|M1
RFG|Rooke Field|Refugio|US|S0
RFK|Rollang Field|Rolling Fork|US|S0
RFN|Raufarhöfn Airport|Raufarhöfn|IS|S0
RFP|Raiatea Airport|Uturoa|PF|M1
RFR|Rio Frio / Progreso Airport|Rio Frio / Progreso|CR|S0
RFS|Rosita Airport|La Rosita|NI|S0
RGA|Gobernador Ramón Trejo Noel International Airport|Rio Grande|AR|M1
RGH|Balurghat Airport|Balurghat|IN|S0
RGI|Rangiroa Airport||PF|M1
RGK|Gorno-Altaysk Airport|Gorno-Altaysk|RU|M0
RGL|Piloto Civil Norberto Fernández International Airport|Rio Gallegos|AR|L1
RGN|Yangon International Airport|Yangon|MM|L1
RGO|Orang (Chongjin) Airport|Hoemun-ri|KP|M1
RGR|Ranger Municipal Airport|Ranger|US|S0
RGS|Burgos Airport|Burgos|ES|M0
RGT|Japura Airport|Rengat-Sumatra Island|ID|M0
RHA|Reykhólar Airport|Reykhólar|IS|S0
RHD|Termas de Río Hondo international Airport|Termas de Río Hondo|AR|M1
RHG|Ruhengeri Airport|Ruhengeri|RW|S0
RHI|Rhinelander Oneida County Airport|Rhinelander|US|M1
RHL|Roy Hill Station Airport||AU|S0
RHN|Skorpion Mine Airport|Rosh Pinah|NA|S0
RHO|Rhodes International Airport "Diagoras"|Rhodes|GR|L1
RHP|Ramechhap Airport|Ramechhap|NP|S0
RHT|Alxa Right Banner Badanjilin Airport|Badanjilin|CN|S1
RHV|Reid-Hillview Airport of Santa Clara County|San Jose|US|S0
RIA|Santa Maria Airport|Santa Maria|BR|M1
RIB|Capitán Av. Selin Zeitun Lopez Airport|Riberalta|BO|M1
RIC|Richmond International Airport|Richmond|US|L1
RID|Richmond Municipal Airport|Richmond|US|S0
RIE|Rice Lake Regional Airport - Carl's Field|Rice Lake|US|S0
RIF|Richfield Municipal Airport|Richfield|US|S0
RIG|Rio Grande Regional Airport|Rio Grande|BR|S0
RIH|Scarlett Martinez International Airport|Río Hato|PA|S1
RIJ|Juan Simons Vela Airport|Rioja|PE|M0
RIL|Garfield County Regional Airport|Rifle|US|M0
RIM|San Nicolas Airport|Rodriguez de Mendoza|PE|S0
RIN|Ringi Cove Airport|Ringi Cove|SB|S0
RIR|Flabob Airport|Riverside|US|S0
RIS|Rishiri Airport|Rishiri|JP|M1
RIV|March Air Reserve Base|Riverside|US|M0
RIW|Central Wyoming Regional Airport|Riverton|US|M1
RIX|Riga International Airport|Riga|LV|L1
RIY|Riyan International Airport|Mukalla(Riyan)|YE|L1
RIZ|Rizhao Shanzihe Airport|Rizhao (Donggang)|CN|M1
RJA|Rajahmundry Airport|Madhurapudi|IN|M1
RJB|Rajbiraj Airport|Rajbiraj|NP|S0
RJH|Shah Makhdum Airport|Rajshahi|BD|M1
RJI|Rajouri Airport|Rajouri|IN|S0
RJK|Rijeka Airport|Rijeka(Omišalj)|HR|L1
RJL|Logroño-Agoncillo Airport|Logroño|ES|M1
RJM|Marinda Airport|Waisai|ID|S1
RJN|Rafsanjan Airport|Rafsanjan|IR|M1
RKA|Aratika Nord Airport||PF|S0
RKD|Knox County Regional Airport|Rockland|US|M1
RKE|Copenhagen Roskilde Airport|Roskilde|DK|M1
RKH|Rock Hill - York County Airport|Rock Hill|US|S0
RKI|Mentawai Airport|Sipura Island|ID|S1
RKP|Aransas County Airport|Rockport|US|S0
RKR|Robert S Kerr Airport|Poteau|US|S0
RKS|Southwest Wyoming Regional Airport|Rock Springs|US|M1
RKT|Ras Al Khaimah International Airport|Ras Al Khaimah|AE|L1
RKU|Kairuku Airport|Yule Island|PG|S0
RKV|Reykjavík Domestic Airport|Reykjavík|IS|M1
RKW|Rockwood Municipal Airport|Rockwood|US|S0
RKY|Rokeby Airport|Rokeby|AU|S0
RKZ|Xigaze Peace Airport / Shigatse Air Base|Xigazê (Samzhubzê)|CN|L1
RLA|Rolla Downtown Airport|Rolla|US|S0
RLD|Richland Airport|Richland|US|S0
RLG|Rostock-Laage Airport|Laage|DE|M1
RLK|Bayannur Tianjitai Airport|Bayannur|CN|M1
RLO|Valle Del Conlara International Airport|Merlo|AR|S0
RLP|Rosella Plains Airport|Rosella Plains|AU|S0
RLR|Relais de la Reine Airport|Isalo|MG|S0
RLT|Arlit Airport|Arlit|NE|S0
RMA|Roma Airport|Roma|AU|M1
RMB|Buraimi Airport|Buraimi|OM|S0
RMD|Basanth Nagar Airport|Ramagundam|IN|S0
RME|Griffiss International Airport|Rome|US|M0
RMF|Marsa Alam International Airport|Marsa Alam|EG|L1
RMG|Richard B Russell Airport|Rome|US|M0
RMI|Federico Fellini International Airport|Rimini (RN)|IT|L1
RMK|Renmark Airport||AU|M0
RML|Colombo Ratmalana International Airport|Colombo|LK|L1
RMN|Rumginae Airport||PG|S0
RMO|Chişinău International Airport|Chişinău|MD|L1
RMP|Rampart Airport|Rampart|US|S1
RMQ|Taichung International Airport / Ching Chuang Kang Air Base|Taichung (Qingshui)|TW|L1
RMS|Ramstein Air Base|Ramstein-Miesenbach|DE|M0
RMT|Rimatara Airport|Rimatara Island|PF|S1
RMU|Region of Murcia International Airport|Corvera|ES|L1
RMY|Mariposa Yosemite Airport|Mariposa|US|S0
RMZ|Tobolsk Remezov Airport|Tobolsk|RU|M1
RNA|Ulawa Airport|Arona|SB|S0
RNB|Ronneby Airport|Ronneby|SE|M1
RNC|Warren County Memorial Airport|Mc Minnville|US|S0
RND|Randolph Air Force Base|Universal City|US|M0
RNE|Roanne-Renaison Airport|Saint-Léger-sur-Roanne|FR|M0
RNH|New Richmond Regional Airport|New Richmond|US|M0
RNI|Corn Island Airport|Corn Island|NI|S1
RNJ|Yoron Airport|Yoron|JP|M1
RNL|Rennell/Tingoa Airport|Rennell Island|SB|S1
RNM|Qarn Alam Airport|Ghaba|OM|S0
RNN|Bornholm Airport|Rønne|DK|M1
RNO|Reno Tahoe International Airport|Reno|US|L1
RNP|Rongelap Island Airport|Rongelap Island|MH|S1
RNS|Rennes-Saint-Jacques Airport|Saint-Jacques-de-la-Lande, Ille-et-Vilaine|FR|M1
RNT|Renton Municipal Airport|Renton|US|S0
RNU|Ranau Airport|Ranau|MY|S0
RNZ|Jasper County Airport|Rensselaer|US|S0
ROA|Roanoke–Blacksburg Regional Airport|Roanoke|US|M1
ROB|Roberts International Airport|Monrovia|LR|L1
ROC|Frederick Douglass Greater Rochester International Airport|Rochester|US|L1
ROD|Robertson Airport|Robertson|ZA|M0
ROF|Montague-Yreka Rohrer Field|Montague|US|S0
ROG|Rogers Municipal Airport-Carter Field|Rogers|US|S0
ROH|Robinhood Airport||AU|S0
ROI|Roi Et Airport|Roi Et|TH|M1
ROK|Rockhampton Airport|Rockhampton|AU|M1
ROL|Roosevelt Municipal Airport|Roosevelt|US|S0
RON|Juan Jose Rondon Airport|Paipa|CO|S0
ROO|Maestro Marinho Franco Airport|Rondonópolis|BR|M1
ROP|Rota International Airport|Rota Island|MP|L1
ROR|Roman Tmetuchl International Airport|Babelthuap Island|PW|L1
ROS|Rosario Islas Malvinas International Airport|Rosario|AR|L1
ROT|Rotorua Regional Airport|Rotorua|NZ|M1
ROU|Ruse Airport|Shtraklevo|BG|S0
ROV|Platov International Airport|Rostov-on-Don|RU|L0
ROW|Roswell Air Center Airport|Roswell|US|M1
ROX|Roseau Municipal Rudy Billberg Field|Roseau|US|S0
ROY|Rio Mayo Airport|Rio Mayo|AR|S0
ROZ|Rota Naval Station Airport|Rota|ES|M0
RPA|Rolpa Airport|Rolpa|NP|S0
RPB|Roper Bar Airport|Roper Bar|AU|S0
RPM|Ngukurr Airport|Roper River|AU|M0
RPN|Rosh Pina Airport|Rosh Pina|IL|M0
RPR|Swami Vivekananda Airport|Raipur|IN|M1
RPU|Urucu Airport|Urucu|BR|S0
RPV|Roper Valley Airport|Roper Valley|AU|S0
RPX|Roundup Airport|Roundup|US|S0
RQA|Ruoqiang Loulan Airport|Ruoqiang Town|CN|M1
RQO|El Reno Regional Airport|El Reno|US|S0
RQW|Qayyarah West Airport|Qayyarah|IQ|M0
RQY|Rashtrakavi Kuvempu Airport|Shimoga|IN|M0
RRE|Marree Airport||AU|M0
RRG|Sir Charles Gaetan Duval Airport|Port Mathurin|MU|M1
RRJ|Jacarepaguá - Roberto Marinho Airport|Rio de Janeiro|BR|M0
RRK|Rourkela Airport|Rourkela|IN|M0
RRL|Merrill Municipal Airport|Merrill|US|S0
RRM|Marromeu Airport|Marromeu|MZ|S0
RRR|Raroia Airport|Raroia|PF|S1
RRS|Røros Airport|Røros|NO|M1
RRT|Warroad International Memorial Airport|Warroad|US|S0
RRV|Robinson River Airport||AU|S0
RSA|Santa Rosa Airport|Santa Rosa|AR|M1
RSB|Roseberth Airport||AU|S0
RSD|Rock Sound International Airport|Rock Sound|BS|M1
RSH|Russian Mission Airport|Russian Mission|US|S1
RSI|Red Sea International Airport|Hanak|SA|L1
RSK|Abresso Airport|Ransiki-Papua Island|ID|S0
RSL|Russell Municipal Airport|Russell|US|M0
RSN|Ruston Regional Airport|Ruston|US|S0
RSS|Damazin Airport|Ad Damazin|SD|S0
RST|Rochester International Airport|Rochester|US|M1
RSU|Yeosu Airport|Yeosu|KR|M1
RSW|Southwest Florida International Airport|Fort Myers|US|L1
RTA|Rotuma Airport|Rotuma|FJ|S1
RTB|Juan Manuel Gálvez International Airport|Coxen Hole|HN|L1
RTC|Ratnagiri Airport||IN|M0
RTE|Campo de Marte Airport|São Paulo|BR|M0
RTG|Frans Sales Lega Airport|Satar Tacik, Manggarai|ID|S1
RTI|David Constantijn Saudale Airport|Ba'a - Rote Island|ID|S1
RTL|Spirit Lake Municipal Airport|Okoboji|US|S0
RTM|Rotterdam The Hague Airport|Rotterdam|NL|L1
RTN|Raton Municipal Airport / Crews Field|Raton|US|S0
RTO|Budiarto Airport|Tangerang-Java Island|ID|S0
RTP|Rutland Plains Airport|Yagoonya|AU|S0
RTS|Rottnest Island Airport||AU|S0
RTU|Maratua Airport|Maratua|ID|S0
RTY|Merty Merty Airport||AU|S0
RUA|Arua Airport|Arua|UG|M1
RUD|Shahrud International Airport|Shahrud|IR|S0
RUE|Rughenda Airfield|Butembo|CD|S0
RUF|Yuruf Airport [UNUSABLE]|Amgotro|ID|S0
RUG|Rugao Air Base|Rugao (Nantong)|CN|M0
RUH|King Khalid International Airport|Riyadh|SA|L1
RUI|Sierra Blanca Regional Airport|Alto|US|M0
RUK|Rukum Chaurjahari Airport|Rukumkot|NP|S0
RUL|Maavaarulaa Airport|Maavaarulu|MV|S1
RUM|Rumjatar Airport|Rumjatar|NP|S0
RUN|Roland Garros Airport|Sainte-Marie|RE|L1
RUP|Rupsi Airport|Rupsi|IN|S0
RUR|Rurutu Airport||PF|M1
RUS|Marau Airport|Marau|SB|S1
RUT|Rutland - Southern Vermont Regional Airport|Rutland|US|M1
RUU|Ruti Airport|Kawbenaberi|PG|S0
RUV|Rubelsanto Airport|Rubelsanto|GT|M0
RUY|Rioamarillo Airport|Copán Ruinas|HN|S0
RVA|Farafangana Airport|Farafangana|MG|S0
RVC|River Cess Airport and Heliport|River Cess|LR|S0
RVD|General Leite de Castro Airport|Rio Verde|BR|S0
RVE|Los Colonizadores Airport|Saravena|CO|S1
RVK|Rørvik Airport, Ryum|Rørvik|NO|M1
RVN|Rovaniemi Airport|Rovaniemi|FI|L1
RVO|Reivilo Airport|Reivilo|ZA|S0
RVR|Green River Municipal Airport|Green River|US|S0
RVS|Tulsa Riverside Airport|Tulsa|US|M0
RVT|Ravensthorpe Airport||AU|S0
RVV|Raivavae Airport||PF|S1
RVY|Pres. Gral. Óscar D. Gestido Binational Airport|Rivera/Santana do Livramento|UY|M1
RWF|Redwood Falls Municipal Airport|Redwood Falls|US|M0
RWI|Rocky Mount Wilson Regional Airport|Rocky Mount|US|M0
RWL|Rawlins Municipal Airport/Harvey Field|Rawlins|US|M0
RWN|Rivne International Airport|Rivne|UA|M0
RXA|Ar Rawdah Airport|Ar Rawdah|YE|S0
RXE|Rexburg Madison County Airport|Rexburg|US|S0
RXS|Roxas Airport|Roxas City|PH|M1
RYB|Staroselye Airport|Rybinsk|RU|M0
RYK|Shaikh Zaid Airport|Rahim Yar Khan|PK|M1
RYL|Royal Zambezi Lodge Airstrip|Lower Zambezi River|ZM|S0
RYN|Royan-Médis Airport|Royan/Médis|FR|M0
RYO|28 de Noviembre Airport|Rio Turbio|AR|S1
RZA|Santa Cruz Airport|Puerto Santa Cruz|AR|M0
RZE|Rzeszów-Jasionka Airport|Jasionka|PL|L1
RZH|Preobrazheniye Airport|Preobrazheniye|RU|S0
RZP|Cesar Lim Rodriguez (Taytay-Sandoval) Airport|Taytay|PH|S0
RZR|Ramsar Airport|Ramsar|IR|M1
RZS|Sawan Airport|Sawan Gas Field|PK|S0
RZV|Rize–Artvin Airport|Rize|TR|M1
SAA|Shively Field|Saratoga|US|S0
SAB|Juancho E. Yrausquin Airport|Zion's Hill|BQ|M1
SAC|Sacramento Executive Airport|Sacramento|US|M0
SAD|Safford Regional Airport|Safford|US|S0
SAF|Santa Fe Municipal Airport|Santa Fe|US|M1
SAG|Shirdi International Airport|Kakadi|IN|L1
SAH|Sanaa International Airport|Sanaa|YE|L1
SAI|Siem Reap-Angkor International Airport|Siem Reap|KH|L1
SAK|Sauðárkrókur Airport|Sauðárkrókur|IS|S0
SAL|El Salvador International Airport Saint Óscar Arnulfo Romero y Galdámez|San Salvador (San Luis Talpa)|SV|L1
SAM|Salamo Airport|Salamo|PG|S0
SAN|San Diego International Airport|San Diego|US|L1
SAP|Ramón Villeda Morales International Airport|San Pedro Sula|HN|L1
SAQ|San Andros Airport|Andros Island|BS|M1
SAR|Sparta Community Airport - Hunter Field|Sparta|US|S0
SAS|Salton Sea Airport|Salton City|US|S0
SAT|San Antonio International Airport|San Antonio|US|L1
SAU|Sabu-Tardanu Airport|Sabu-Sawu Island|ID|S0
SAV|Savannah Hilton Head International Airport|Savannah|US|L1
SAW|Istanbul Sabiha Gökçen International Airport|Pendik, Istanbul|TR|L1
SAX|Sambú Airport|Boca de Sábalo|PA|S0
SAZ|Sasstown Airport|Sasstown|LR|S0
SBA|Santa Barbara Municipal Airport|Santa Barbara|US|M1
SBB|Santa Bárbara de Barinas Airport|Santa Bárbara|VE|S0
SBC|Selbang Airport|Selbang|PG|S0
SBD|San Bernardino International Airport|San Bernardino|US|L1
SBE|Suabi Airport||PG|S0
SBF|Sardeh Band Airport|Sardeh Band|AF|S0
SBG|Maimun Saleh Airport|Sabang|ID|S0
SBH|St. Jean Airport|Gustavia|BL|M1
SBI|Sambailo Airport|Koundara|GN|S0
SBJ|São Mateus - Ernesto Bonomo Airport|São Mateus|BR|S0
SBK|Saint-Brieuc-Armor Airport|Trémuson, Côtes-d'Armor|FR|M0
SBL|Santa Ana Del Yacuma Airport|Santa Ana del Yacuma|BO|M0
SBM|Sheboygan County Memorial Airport|Sheboygan|US|S0
SBN|South Bend International Airport|South Bend|US|M1
SBO|Salina Gunnison Airport|Salina|US|S0
SBP|San Luis County Regional Airport|San Luis Obispo|US|M1
SBQ|Sibi Airport|Sibi|PK|S0
SBR|Saibai Island Airport|Saibai Island|AU|S1
SBS|Steamboat Springs Bob Adams Field|Steamboat Springs|US|S0
SBT|Sabetta International Airport|Sabetta|RU|M1
SBU|Springbok Airport|Springbok|ZA|M0
SBV|Sabah Airport|Sabah|PG|S0
SBW|Sibu Airport|Sibu|MY|M1
SBX|Shelby Airport|Shelby|US|S0
SBY|Salisbury Ocean City Wicomico Regional Airport|Salisbury|US|M1
SBZ|Sibiu International Airport|Sibiu|RO|L1
SCA|Santa Catalina Airport|Santa Catalina|CO|S0
SCB|Scribner State Airport|Scribner|US|S0
SCC|Deadhorse Airport|Deadhorse|US|M1
SCD|Sulaco Airport|Sulaco|HN|S0
SCE|State College Regional Airport|State College|US|M1
SCF|Scottsdale Airport|Scottsdale|US|S0
SCG|Spring Creek Airport||AU|S0
SCH|Schenectady County Airport|Schenectady|US|M0
SCI|Paramillo Airport|San Cristóbal|VE|M0
SCK|Stockton Metropolitan Airport|Stockton|US|M1
SCL|Comodoro Arturo Merino Benítez International Airport|Santiago|CL|L1
SCM|Scammon Bay Airport|Scammon Bay|US|S1
SCN|Saarbrücken Airport|Saarbrücken|DE|M1
SCO|Aktau International Airport|Aktau|KZ|L1
SCP|Mont-Dauphin Saint-Crépin Airfield|Saint-Crépin, Hautes-Alpes|FR|S0
SCQ|Santiago-Rosalía de Castro Airport|Santiago de Compostela|ES|L1
SCR|Scandinavian Mountains Airport|Malung-Sälen|SE|L1
SCT|Socotra Airport|Mori|YE|M1
SCU|Antonio Maceo International Airport|Santiago|CU|L1
SCV|Suceava Ștefan cel Mare International Airport|Suceava|RO|L1
SCW|Syktyvkar Airport|Syktyvkar|RU|M1
SCX|Estación Aeronaval de Salina Cruz|Salina Cruz|MX|S0
SCY|San Cristóbal Airport|Puerto Baquerizo Moreno|EC|S1
SCZ|Santa Cruz/Graciosa Bay/Luova Airport|Santa Cruz/Graciosa Bay/Luova|SB|S1
SDB|Langebaanweg Airport|Langebaanweg|ZA|M0
SDC|Sand Creek Airport|Sand Creek|GY|S0
SDD|Lubango Mukanka International Airport|Lubango|AO|M1
SDE|Vicecomodoro Angel D. La Paz Aragonés Airport|Santiago del Estero|AR|M1
SDF|Louisville Muhammad Ali International Airport|Louisville|US|L1
SDG|Sanandaj Airport||IR|M1
SDI|Saidor Airport|Saidor|PG|S0
SDJ|Sendai Airport|Natori|JP|L1
SDK|Sandakan Airport|Sandakan|MY|M1
SDL|Sundsvall-Härnösand Airport|Sundsvall/ Härnösand|SE|M1
SDM|Brown Field Municipal Airport|San Diego|US|M0
SDN|Sandane Airport, Anda|Sandane|NO|S1
SDP|Sand Point Airport|Sand Point|US|M1
SDQ|Las Américas International Airport|Santo Domingo|DO|L1
SDR|Seve Ballesteros-Santander Airport|Santander|ES|M1
SDS|Sado Airport|Sado|JP|M1
SDT|Saidu Sharif Airport|Saidu Sharif|PK|M0
SDU|Santos Dumont Airport|Rio de Janeiro|BR|L1
SDW|Sindhudurg Airport|Chipi|IN|M1
SDX|Sedona Airport|Sedona|US|S0
SDY|Sidney - Richland Regional Airport|Sidney|US|M1
SEA|Seattle–Tacoma International Airport|Seattle|US|L1
SEB|Sabha Airport|Sabha|LY|M1
SEE|Gillespie Field|San Diego/El Cajon|US|S0
SEF|Sebring Regional Airport|Sebring|US|S0
SEG|Penn Valley Airport|Selinsgrove|US|S0
SEH|Senggeh Airport|Senggeh|ID|S0
SEK|Srednekolymsk Airport|Srednekolymsk|RU|M1
SEM|Craig Field|Selma|US|S0
SEN|London Southend Airport|Southend-on-Sea, Essex|GB|M1
SEO|Séguéla Airport|Séguéla|CI|S0
SEP|Stephenville Clark Regional Airport|Stephenville|US|S0
SEQ|Sungai Pakning Bengkalis Airport|Bengkalis-Sumatra Island|ID|S0
SER|Freeman Municipal Airport|Seymour|US|S0
SES|Svetlogorsk Airport|Svetlogorsk|RU|M0
SET|Santa Magalhães Airport|Serra Talhada|BR|S1
SEU|Seronera Airport|Seronera|TZ|S1
SEW|Siwa Oasis North Airport|Siwa Oasis|EG|S0
SEY|Sélibaby Airport|Sélibaby|MR|S0
SEZ|Seychelles International Airport|Victoria|SC|L1
SFA|Sfax Thyna International Airport|Sfax|TN|M1
SFB|Orlando Sanford International Airport|Orlando|US|L1
SFC|St-François Airport|St-François|GP|S1
SFD|San Fernando de Apure Las Flecheras National Airport|San Fernando de Apure|VE|M0
SFE|San Fernando Airport|San Fernando|PH|M0
SFF|Felts Field|Spokane|US|M0
SFG|Grand Case-l'Espérance Airport|Grand Case|MF|M1
SFH|San Felipe International Airport|Mexicali|MX|S0
SFJ|Kangerlussuaq International Airport|Kangerlussuaq|GL|M1
SFK|Soure Airport|Soure|BR|S0
SFL|São Filipe Airport|São Filipe|CV|S1
SFM|Sanford Seacoast Regional Airport|Sanford|US|S0
SFN|Sauce Viejo Airport|Santa Fe|AR|M1
SFO|San Francisco International Airport|San Francisco|US|L1
SFS|Subic Bay International Airport / Naval Air Station Cubi Point|Olongapo|PH|L1
SFT|Skellefteå Airport|Skellefteå|SE|M1
SFU|Safia Airport|Safia|PG|S0
SFV|Santa Fé do Sul Airport|Santa Fé do Sul|BR|S0
SFX|Macagua Airport|Ciudad Guayana|VE|S0
SFZ|North Central State Airport|Pawtucket|US|S0
SGA|Sheghnan Airport|Shiveh|AF|S0
SGC|Surgut International Airport|Surgut|RU|L1
SGD|Sønderborg Airport|Sønderborg|DK|M1
SGE|Siegerland Airport|Burbach|DE|M0
SGF|Springfield Branson National Airport|Springfield|US|M1
SGH|Springfield-Beckley Municipal Airport|Springfield|US|M0
SGI|Mushaf Air Base|Sargodha|PK|M0
SGK|Sengapi Airstrip|Sengapi|PG|S0
SGL|Danilo Atienza Air Base|Cavite|PH|M0
SGM|San Ignacio Airport|Mulegé|MX|S0
SGN|Tan Son Nhat International Airport|Ho Chi Minh City|VN|L1
SGO|St George Airport||AU|S1
SGP|Shay Gap Airport|Shay Gap|AU|S0
SGQ|Sangkimah Airport|Sanggata|ID|S0
SGR|Sugar Land Regional Airport|Houston|US|M0
SGT|Stuttgart Municipal Airport / Carl Humphrey Field|Stuttgart|US|S0
SGU|St George Regional Airport|St George|US|M1
SGV|Sierra Grande Airport|Sierra Grande|AR|S0
SGX|Songea Airport|Songea|TZ|S0
SGY|Skagway Airport|Skagway|US|S1
SGZ|Songkhla Airport||TH|M0
SHA|Shanghai Hongqiao International Airport|Shanghai (Minhang)|CN|L1
SHB|Nakashibetsu Airport|Nakashibetsu|JP|M1
SHC|Shire Inda Selassie Airport|Shire Inda Selassie|ET|S1
SHD|Shenandoah Valley Regional Airport|Weyers Cave|US|M1
SHE|Shenyang Taoxian International Airport|Shenyang|CN|L1
SHF|Shihezi Huayuan Airport|Shihezi|CN|S1
SHG|Shungnak Airport|Shungnak|US|S1
SHH|Shishmaref Airport|Shishmaref|US|S1
SHI|Shimojishima Airport|Miyakojima|JP|M1
SHJ|Sharjah International Airport|Sharjah|AE|L1
SHK|Sehonghong Airport|Sehonghong|LS|S0
SHL|Shillong Airport|Shillong|IN|M1
SHM|Nanki Shirahama Airport|Shirahama|JP|M1
SHN|Sanderson Field|Shelton|US|S0
SHO|King Mswati III International Airport|Mpaka|SZ|L1
SHQ|Southport Airport||AU|S0
SHR|Sheridan County Airport|Sheridan|US|M1
SHS|Jingzhou Shashi Airport|Jingzhou (Shashi)|CN|M1
SHT|Shepparton Airport||AU|M0
SHU|Smith Point Airport||AU|S0
SHV|Shreveport Regional Airport|Shreveport|US|M1
SHW|Sharurah Domestic Airport|Sharurah|SA|M1
SHX|Shageluk Airport|Shageluk|US|S0
SHY|Shinyanga Airport|Shinyanga|TZ|S1
SHZ|Seshutes Airport|Seshutes|LS|S0
SIA|Xi'an Xiguan Airport|Xi'an (Baqiao)|CN|M0
SIB|Sibiti Airport|Sibiti|CG|S0
SIC|San José Island Airport|Las Perlas|PA|S0
SID|Amílcar Cabral International Airport|Espargos|CV|L1
SIF|Simara Airport|Simara|NP|S1
SIG|Fernando Luis Ribas Dominicci Airport|San Juan|PR|M1
SIH|Silgadi Doti Airport|Silgadi Doti|NP|S1
SIJ|Siglufjörður Airport|Siglufjörður|IS|M0
SIK|Sikeston Memorial Municipal Airport|Sikeston|US|S0
SIL|Sila Airport|Sila Mission|PG|S0
SIM|Simbai Airport|Simbai|PG|S0
SIN|Singapore Changi Airport|Singapore|SG|L1
SIO|Smithton Airport||AU|M0
SIP|Simferopol International Airport|Simferopol|UA|L0
SIQ|Dabo Airport|Pasirkuning-Singkep Island|ID|S0
SIR|Sion Airport|Sion|CH|M0
SIS|Sishen Airport|Sishen|ZA|M1
SIT|Sitka Rocky Gutierrez Airport|Sitka|US|M1
SIU|Siuna|Siuna|NI|S0
SIV|Sullivan County Airport|Sullivan|US|S0
SIW|Sibisa Airport|Parapat-Sumatra Island|ID|S0
SIX|Singleton Airport|Singleton|AU|S0
SIY|Siskiyou County Airport|Montague|US|S0
SIZ|Sissano Airport|Sissano|PG|S0
SJA|San Juan de Marcona Airport|San Juan de Marcona|PE|S0
SJB|San Joaquín Airport|San Joaquín|BO|S0
SJC|Mineta San Jose International Airport|San Jose|US|L1
SJD|Los Cabos International Airport|San José del Cabo|MX|L1
SJE|Jorge E. Gonzalez Torres Airport|San José Del Guaviare|CO|M1
SJH|San Juan Del César Airport|San Juan Del César|CO|S0
SJI|San Jose Airport|San Jose|PH|M1
SJJ|Sarajevo International Airport|Sarajevo|BA|L1
SJK|Professor Urbano Ernesto Stumpf Airport|São José Dos Campos|BR|M1
SJL|São Gabriel da Cachoeira Airport|São Gabriel da Cachoeira|BR|M1
SJN|St Johns Industrial Air Park|St Johns|US|S0
SJO|Juan Santamaría International Airport|San José (Alajuela)|CR|L1
SJP|Prof. Eribelto Manoel Reino State Airport|São José do Rio Preto|BR|M1
SJQ|Sesheke Airport|Sesheke|ZM|S0
SJR|San Juan De Uraba Airport|San Juan De Uraba|CO|S0
SJS|San José De Chiquitos Airport|San José de Chiquitos|BO|S0
SJT|San Angelo Regional Mathis Field|San Angelo|US|M1
SJU|Luis Munoz Marin International Airport|San Juan|PR|L1
SJV|San Javier Airport|San Javier|BO|S0
SJW|Shijiazhuang Zhengding International Airport|Shijiazhuang|CN|L1
SJX|Sartaneja Airport|Sartaneja|BZ|M0
SJY|Seinäjoki Airport|Seinäjoki / Ilmajoki|FI|M0
SJZ|São Jorge Airport|Velas|PT|M1
SKA|Fairchild Air Force Base|Spokane|US|M0
SKB|Robert L. Bradshaw International Airport|Basseterre|KN|L1
SKC|Suki Airport|Suki|PG|S0
SKD|Samarkand International Airport|Samarkand|UZ|L1
SKF|Lackland Air Force Base|San Antonio|US|M0
SKG|Thessaloniki Macedonia International Airport|Thessaloniki|GR|L1
SKH|Surkhet Airport|Surkhet|NP|S1
SKJ|Singkawang Airport|Singkawang|ID|S0
SKK|Shaktoolik Airport|Shaktoolik|US|S1
SKL|Broadford Airstrip|Ashaig, Highland|GB|S0
SKM|Skeldon Airport|Skeldon|GY|S0
SKN|Stokmarknes Airport, Skagen|Hadsel|NO|M1
SKO|Sadiq Abubakar III International Airport|Sokoto|NG|L1
SKP|Skopje International Airport|Ilinden|MK|L1
SKQ|Sekakes Airport|Sekakes|LS|S0
SKR|Shakiso Airport|Shakiso|ET|S0
SKS|Skrydstrup Air Base|Vojens|DK|M0
SKT|Sialkot International Airport|Sialkot|PK|L1
SKU|Skiros Airport|Skiros Island|GR|S1
SKV|Saint Catherine International Airport|Saint Catherine|EG|M0
SKW|Skwentna Airport|Skwentna|US|S0
SKX|Saransk International Airport|Saransk|RU|L1
SKZ|Begum Nusrat Bhutto International Airport Sukkur|Sukkur|PK|M1
SLA|Martín Miguel de Güemes International Airport|Salta|AR|L1
SLB|Storm Lake Municipal Airport|Storm Lake|US|S0
SLC|Salt Lake City International Airport|Salt Lake City|US|L1
SLD|Sliač Airport|Sliač|SK|M1
SLE|Salem-Willamette Valley Airport/McNary Field|Salem|US|M1
SLF|As-Sulayyil Airport|As-Sulayyil|SA|S0
SLG|Smith Field|Siloam Springs|US|S0
SLH|Sola Airport|Sola|VU|S1
SLI|Solwesi Airport|Solwesi|ZM|S1
SLJ|Solomon Airport|Karijini National Park|AU|S0
SLK|Adirondack Regional Airport|Saranac Lake|US|M1
SLL|Salalah International Airport|Salalah|OM|L1
SLM|Salamanca Airport|Salamanca|ES|M1
SLN|Salina Municipal Airport|Salina|US|M1
SLO|Salem–Leckrone Airport|Salem|US|S0
SLP|Ponciano Arriaga International Airport|San Luis Potosí|MX|M1
SLQ|Sleetmute Airport|Sleetmute|US|S1
SLR|Sulphur Springs Municipal Airport|Sulphur Springs|US|S0
SLT|Salida Airport - Harriet Alexander Field|Salida|US|S0
SLU|George F. L. Charles Airport|Castries|LC|M1
SLV|Shimla Airport|Jubbarhatti|IN|S0
SLW|Plan de Guadalupe International Airport|Saltillo|MX|M1
SLX|Salt Cay Airport|Salt Cay|TC|S1
SLY|Salekhard Airport|Salekhard|RU|M1
SLZ|Marechal Cunha Machado International Airport|São Luís|BR|L1
SMA|Santa Maria Airport|Vila do Porto|PT|M1
SMB|Franco Bianco Airport|Cerro Sombrero|CL|S0
SMD|Smith Field|Fort Wayne|US|S0
SME|Lake Cumberland Regional Airport|Somerset|US|M0
SMF|Sacramento International Airport|Sacramento|US|L1
SMH|Sapmanga Airport|Sapmanga|PG|S0
SMI|Samos Airport|Samos Island|GR|M1
SMJ|Sim Airport|Sim|PG|S0
SMK|St Michael Airport|St Michael|US|S1
SML|Stella Maris Airport|Stella Maris|BS|M1
SMM|Semporna Airport|Semporna|MY|S0
SMN|Lemhi County Airport|Salmon|US|M1
SMO|Santa Monica Municipal Airport|Santa Monica|US|M0
SMP|Stockholm Landing Strip|Stockholm|PG|S0
SMQ|Sampit (H.Asan) Airport|Sampit|ID|S1
SMR|Simón Bolívar International Airport|Santa Marta|CO|M1
SMS|Sainte Marie Airport|Vohilava|MG|M1
SMT|Adolino Bedin Regional Airport|Sorriso|BR|S1
SMU|Sheep Mountain Airport|Sheep Mountain|US|S0
SMV|Engadin Airport|Samedan|CH|M0
SMW|Smara Airport|Smara|EH|M1
SMX|Santa Maria Public Airport Captain G Allan Hancock Field|Santa Maria|US|M1
SMY|Simenti Airport|Simenti|SN|S0
SMZ|Stoelmanseiland Airport|Stoelmanseiland|SR|S0
SNA|John Wayne Orange County International Airport|Santa Ana|US|L1
SNB|Snake Bay Airport|Milikapiti|AU|M1
SNC|General Ulpiano Paez International Airport|Salinas/La Libertad|EC|L1
SNE|Preguiça Airport|Preguiça|CV|M1
SNF|Sub Teniente Nestor Arias Airport|San Felipe|VE|M0
SNG|Capitán Av. Juan Cochamanidis S. Airport|San Ignacio de Velasco|BO|S0
SNH|Stanthorpe Airport||AU|S0
SNI|Greenville/Sinoe Airport|Greenville|LR|M0
SNJ|San Julián Air Base|Sandino|CU|M0
SNK|Winston Field|Snyder|US|S0
SNL|Shawnee Regional Airport|Shawnee|US|S0
SNM|San Ignacio de Moxos Airport|San Ignacio de Moxos|BO|S0
SNN|Shannon Airport|Shannon|IE|L1
SNO|Sakon Nakhon Airport||TH|M1
SNP|St Paul Island Airport|St Paul Island|US|M1
SNQ|San Quintín Military Airstrip|San Quintín|MX|S0
SNR|Saint-Nazaire-Montoir Airport|Saint-Nazaire/Montoir|FR|M0
SNS|Salinas Municipal Airport|Salinas|US|M0
SNT|Las Cruces Airport|Sabana de Torres|CO|S0
SNU|Abel Santamaria International Airport|Santa Clara|CU|L1
SNV|Santa Elena de Uairén Airport|Santa Elena de Uairén|VE|M1
SNW|Thandwe Airport|Thandwe|MM|M1
SNX|Semnan Municipal Airport|Semnan|IR|S1
SNY|Sidney Municipal Airport Lloyd W Carr Field|Sidney|US|M0
SNZ|Santa Cruz Air Force Base|Rio de Janeiro|BR|M0
SOA|Sóc Trăng Airport|Sóc Trăng|VN|S0
SOB|Hévíz–Balaton Airport|Sármellék|HU|M1
SOC|Adisoemarmo International Airport|Surakarta|ID|L1
SOD|Sorocaba Airport|Sorocaba|BR|S1
SOE|Souanke Airport|Souanke|CG|S0
SOF|Sofia Airport|Sofia|BG|L1
SOG|Sogndal Airport, Haukåsen|Sogndal|NO|S1
SOH|Solita Airport|Solita|CO|S0
SOJ|Sørkjosen Airport|Sørkjosen|NO|M1
SOK|Semonkong Airport|Semonkong|LS|S0
SOL|Solomon State Field|Solomon|US|S0
SOM|San Tomé Airport|El Tigre|VE|M1
SON|Santo Pekoa International Airport|Luganville|VU|M1
SOO|Söderhamn Airport|Söderhamn|SE|M0
SOP|Moore County Airport|Carthage|US|S0
SOQ|Domine Eduard Osok Airport|Sorong|ID|M1
SOR|Al Thaurah Airport|T2|SY|S0
SOT|Sodankyla Airport|Sodankyla|FI|M0
SOU|Southampton Airport|Southampton|GB|M1
SOV|Seldovia Airport|Seldovia|US|S1
SOW|Show Low Regional Airport|Show Low|US|M1
SOX|Alberto Lleras Camargo Airport|Sogamoso|CO|S0
SOY|Stronsay Airport|Stronsay|GB|S1
SOZ|Solenzara (BA 126) Air Base|Solenzara|FR|M0
SPA|Spartanburg Downtown Memorial Airport|Spartanburg|US|S0
SPC|La Palma Airport|Sta Cruz de la Palma, La Palma Island|ES|M1
SPD|Saidpur Airport|Saidpur|BD|M1
SPE|Sepulot Airport|Sepulot|MY|S0
SPF|Black Hills Airport-Clyde Ice Field|Spearfish|US|S0
SPG|Albert Whitted Airport|St Petersburg|US|S0
SPH|Sopu Airport|Sopu|PG|S0
SPI|Abraham Lincoln Capital Airport|Springfield|US|M1
SPJ|Sparti Airfield|Sparti|GR|S0
SPM|Spangdahlem Air Base|Trier|DE|M0
SPN|Saipan International Airport|I Fadang, Saipan|MP|M1
SPP|Menongue Airport|Menongue|AO|M1
SPR|John Greif II Airport|San Pedro|BZ|M1
SPS|Wichita Falls Municipal Airport / Sheppard Air Force Base|Wichita Falls|US|M1
SPT|Sipitang Airport|Sipitang|MY|S0
SPU|Split Saint Jerome Airport|Split|HR|L1
SPV|Sepik Plains Airport|Sepik Plains|PG|S0
SPW|Spencer Municipal Airport|Spencer|US|S0
SPX|Sphinx International Airport|Al Jiza|EG|L1
SPY|San Pedro Airport||CI|M1
SPZ|Springdale Municipal Airport|Springdale|US|S0
SQA|Santa Ynez Airport|Santa Ynez|US|S0
SQB|Santa Ana Airport|Piedras|CO|S0
SQC|Southern Cross Airport||AU|S0
SQD|Shangrao Sanqingshan Airport|Shangrao (Hengfeng)|CN|M1
SQE|San Luis De Palenque Airport|San Luis De Palenque|CO|S0
SQF|Solano Airport|Solano|CO|S0
SQG|Tebelian Airport|Sintang|ID|M1
SQH|Na San Airport|Mai Son|VN|S0
SQI|Whiteside County Airport - Joseph H Bittorf Field|Rock Falls|US|S0
SQJ|Sanming Shaxian Airport|Sanming (Sha)|CN|M1
SQK|Sidi EL Barrani Airport|Sidi El Barrani|EG|S0
SQL|San Carlos Airport|San Carlos|US|M1
SQM|São Miguel do Araguaia Airport|São Miguel do Araguaia|BR|S0
SQN|Emalamo Airport|Sanana|ID|S0
SQO|Storuman Airport|Storuman|SE|M0
SQQ|Šiauliai International Airport|Šiauliai|LT|M0
SQR|Soroako Airport|Soroako|ID|S0
SQS|Matthew Spain Airport|Spanish Lookout|BZ|S0
SQT|China Strait Airstrip|Samarai Island|PG|S0
SQU|Saposoa Airport|Plaza Saposoa|PE|S0
SQV|Sequim Valley Airport|Sequim|US|S0
SQW|Skive Airport|Skive|DK|M0
SQX|São Miguel do Oeste Hélio Wasum Airport|São Miguel do Oeste|BR|S0
SQY|São Lourenço do Sul Airport|São Lourenço Do Sul|BR|S0
SRA|Luis Alberto Lehr Airport|Santa Rosa|BR|S1
SRB|Santa Rosa de Yacuma Airport|Santa Rosa|BO|S0
SRC|Searcy Municipal Airport|Searcy|US|S0
SRD|San Ramón Airport|San Ramón / Mamoré|BO|S0
SRE|Alcantarí International Airport|Sucre|BO|L1
SRG|Jenderal Ahmad Yani Airport|Semarang|ID|L1
SRH|Sarh Airport|Sarh|TD|S0
SRJ|Capitán Av. German Quiroga G. Airport|San Borja|BO|S0
SRL|Palo Verde Airport|Mulegé|MX|S1
SRM|Sandringham Airport|Sandringham Station|AU|S0
SRN|Strahan Airport||AU|S0
SRO|Santana Ramos Airport|Santana Ramos|CO|S0
SRP|Stord Airport, Sørstokken|Leirvik|NO|M1
SRQ|Sarasota Bradenton International Airport|Sarasota/Bradenton|US|L1
SRR|Dunwich Airport|North Stradbroke Island|AU|S0
SRS|San Marcos Airport|San Marcos|CO|S0
SRT|Soroti Airport|Soroti|UG|M1
SRU|Surbung Airport|Falam|MM|S0
SRV|Stony River 2 Airport|Stony River|US|S1
SRW|Mid-Carolina Regional Airport|Salisbury|US|S0
SRX|Sirt International Airport / Ghardabiya Airbase|Sirt|LY|L0
SRY|Sari Dasht-e Naz International Airport|Sari|IR|M1
SRZ|El Trompillo Airport|Santa Cruz|BO|M1
SSA|Deputado Luiz Eduardo Magalhães International Airport|Salvador|BR|L1
SSC|Shaw Air Force Base|Sumter|US|M0
SSD|Víctor Lafón Airport|San Felipe|CL|S0
SSE|Solapur Airport|Solapur|IN|M0
SSF|Stinson Municipal Airport|San Antonio|US|M0
SSG|Malabo International Airport|Malabo|GQ|L1
SSH|Sharm El Sheikh International Airport|Sharm El Sheikh|EG|L1
SSI|St Simons Island Airport|St Simons Island|US|M0
SSJ|Sandnessjøen Airport, Stokka|Alstahaug|NO|M1
SSK|Sturt Creek Airport|Sturt Creek|AU|S0
SSL|Santa Rosalia Airport|Santa Rosalia|CO|S0
SSN|Seoul Air Base (K-16)|Seongnam|KR|M0
SSO|São Lourenço Airport|São Lourenço|BR|S0
SSP|Silver Plains Airport|Silver Plains|AU|S0
SSQ|La Sarre Airport|La Sarre|CA|S0
SSR|Sara Airport|Pentecost Island|VU|S1
SSS|Siassi Airport|Siassi|PG|S0
SST|Santa Teresita Airport|Santa Teresita|AR|M1
SSW|Stuart Island Airpark|Friday Harbor|US|S1
SSX|Singita Safari Lodge Airport|Singita Safari Lodge|ZA|S0
SSY|Mbanza Congo Airport|Mbanza Congo|AO|M1
SSZ|Santos Nero Moura Air Base / Guarujá Airport|Guarujá|BR|M0
STA|Stauning Vestjylland  Airport|Skjern|DK|M0
STB|Miguel Urdaneta Fernández Airport|San Carlos del Zulia|VE|M0
STC|Saint Cloud Regional Airport|Saint Cloud|US|M1
STD|Mayor Buenaventura Vivas International Airport|Santo Domingo|VE|M1
STE|Stevens Point Municipal Airport|Stevens Point|US|S0
STG|St George Airport|St George|US|M1
STH|Strathmore Airport|Strathmore|AU|S0
STI|Cibao International Airport|Santiago|DO|L1
STJ|Rosecrans Memorial Airport|St Joseph|US|M0
STK|Sterling Municipal Airport|Sterling|US|S0
STL|St. Louis Lambert International Airport|St Louis|US|L1
STM|Santarém - Maestro Wilson Fonseca International Airport|Santarém|BR|M1
STN|London Stansted Airport|London, Essex|GB|L1
STP|Saint Paul Downtown Holman Field|Saint Paul|US|M0
STQ|St Marys Municipal Airport|St Marys|US|S0
STR|Stuttgart Airport|Stuttgart|DE|L1
STS|Charles M. Schulz Sonoma County Airport|Santa Rosa|US|M1
STT|Cyril E. King Airport|Charlotte Amalie|VI|L1
STU|Santa Cruz Airport|Santa Cruz|BZ|S0
STV|Surat International Airport|Surat|IN|L1
STW|Stavropol Shpakovskoye Airport|Stavropol|RU|M1
STX|Henry E. Rohlsen Airport|Christiansted|VI|M1
STY|Nueva Hesperides International Airport|Salto|UY|M0
SUA|Witham Field|Stuart|US|S0
SUB|Juanda International Airport|Surabaya|ID|L1
SUD|Stroud Municipal Airport|Stroud|US|S0
SUE|Door County Cherryland Airport|Sturgeon Bay|US|S0
SUF|Lamezia Terme Sant'Eufemia International Airport|Lamezia Terme (CZ)|IT|L1
SUG|Surigao Airport|Surigao City|PH|M1
SUI|Vladislav Ardzinba Sukhum International Airport|Sukhumi|GE|L1
SUJ|Satu Mare International Airport|Satu Mare|RO|M1
SUK|Sakkyryr Airport|Batagay-Alyta|RU|S1
SUL|Sui Airport|Sui|PK|M0
SUM|Sumter Airport|Sumter|US|S0
SUN|Friedman Memorial Airport|Hailey|US|M1
SUO|Sunriver Airport|Sunriver|US|S0
SUP|Trunojoyo Airport|Sumenep|ID|S0
SUQ|Sucúa Airport|Sucúa|EC|S0
SUR|Summer Beaver Airport|Summer Beaver|CA|S1
SUS|Spirit of St Louis Airport|St Louis|US|M0
SUT|Sumbawanga Airport|Sumbawanga|TZ|S0
SUU|Travis Air Force Base|Fairfield|US|M0
SUV|Nausori International Airport|Nausori|FJ|L1
SUW|Richard I Bong Memorial Airport|Superior|US|S0
SUX|Sioux Gateway Airport / Brigadier General Bud Day Field|Sioux City|US|M1
SUY|Suntar Airport|Suntar|RU|S1
SVA|Savoonga Airport|Savoonga|US|M1
SVB|Sambava Airport|Sambava|MG|M1
SVC|Grant County Airport|Silver City|US|M1
SVD|Argyle International Airport|Kingstown|VC|L1
SVE|Susanville Municipal Airport|Susanville|US|S0
SVF|Savé Airport|Savé|BJ|S0
SVG|Stavanger Airport, Sola|Stavanger|NO|L1
SVH|Statesville Regional Airport|Statesville|US|S0
SVI|Eduardo Falla Solano Airport|San Vicente Del Caguán|CO|M1
SVJ|Svolvær Airport, Helle|Svolvær|NO|M1
SVK|Silver Creek Airport|Silver Creek|BZ|S0
SVL|Savonlinna Airport|Savonlinna|FI|M1
SVN|Hunter Army Air Field|Savannah|US|M0
SVO|Sheremetyevo International Airport|Moscow|RU|L1
SVP|Kuito Airport|Kuito|AO|M0
SVQ|Seville Airport|Seville|ES|L1
SVS|Stevens Village Airport|Stevens Village|US|S1
SVT|Savuti Airport|Savuti|BW|S0
SVU|Savusavu Airport|Savusavu|FJ|S1
SVV|San Salvador de Paul Airport|San Salvador de Paul|VE|S0
SVW|Sparrevohn LRRS Airport|Sparrevohn|US|M0
SVX|Koltsovo Airport|Yekaterinburg|RU|L1
SVZ|Juan Vicente Gómez International Airport|San Antonio del Tachira|VE|M1
SWA|Jieyang Chaoshan International Airport|Jieyang (Rongcheng)|CN|L1
SWB|Shaw River Airport|Shaw River|AU|S0
SWC|Stawell Airport||AU|M0
SWD|Seward Airport|Seward|US|M0
SWE|Siwea Airport|Siwea|PG|S0
SWF|New York Stewart International Airport|Newburgh|US|M1
SWG|Satwag Airport|Satwag|PG|S0
SWH|Swan Hill Airport||AU|M0
SWJ|Southwest Bay Airport|Malekula Island|VU|S0
SWL|San Vicente Airport|San Vicente|PH|S1
SWN|Sarsawa Air Force Station|Sherpur Naqeebpur|IN|S0
SWO|Stillwater Regional Airport|Stillwater|US|M1
SWP|Swakopmund Municipal Aerodrome|Swakopmund|NA|S0
SWQ|Sultan Muhammad Kaharuddin III Airport|Sumbawa Besar|ID|S1
SWR|Silur Airport|Silur Mission|PG|S0
SWS|Swansea Airport|Swansea|GB|M0
SWT|Strezhevoy Airport|Strezhevoy|RU|M0
SWU|Suwon Airport|Suwon|KR|M0
SWV|Severo-Evensk Airport|Evensk|RU|M0
SWW|Avenger Field|Sweetwater|US|S0
SWX|Shakawe Airport|Shakawe|BW|S1
SWY|Sitiawan Airport|Sitiawan|MY|S0
SXA|Sialum Airport|Sialum|PG|S0
SXB|Strasbourg Airport|Strasbourg|FR|L1
SXE|West Sale Airport|Sale|AU|M0
SXG|Senanga Airport|Senanga|ZM|S0
SXH|Sehulea Airport|Sehulea|PG|S0
SXI|Siri Airport|Siri|IR|M0
SXJ|Shanshan Airport|Shanshan|CN|M0
SXK|Mathilda Batlayeri Airport|Saumlaki-Yamdena Island|ID|S1
SXL|Sligo Airport|Sligo|IE|M0
SXM|Princess Juliana International Airport|Sint Maarten|SX|L1
SXN|Sua Pan Airport|Sowa|BW|M0
SXO|São Félix do Araguaia Airport|São Félix Do Araguaia|BR|S0
SXP|Nunam Iqua Airport|Nunam Iqua|US|S1
SXQ|Soldotna Airport|Soldotna|US|M0
SXR|Srinagar International Airport|Srinagar|IN|L1
SXS|Sahabat [Sahabat 16] Airport|Sahabat|MY|S0
SXT|Sungai Tiang Airport|Taman Negara|MY|S0
SXU|Soddu Airport|Soddu|ET|S0
SXV|Salem Airport|Salem|IN|M0
SXW|Sauren Airport|Sauren|PG|S0
SXX|São Félix do Xingu Airport|São Félix do Xingu|BR|S0
SXY|Sidney Municipal Airport|Sidney|US|S0
SXZ|Siirt Airport|Siirt|TR|M0
SYA|Eareckson Air Station|Shemya|US|M0
SYC|Shiringayoc Airport|Shiringayoc|PE|S0
SYD|Sydney Kingsford Smith International Airport|Sydney (Mascot)|AU|L1
SYE|Sadah Airport|Sa'dah|YE|S0
SYH|Syangboche Airport|Namche Bazaar|NP|S0
SYI|Bomar Field / Shelbyville Municipal Airport|Shelbyville|US|S0
SYJ|Sirjan Airport|Sirjan|IR|M0
SYK|Stykkishólmur Airport|Stykkishólmur|IS|S0
SYM|Pu'er Simao Airport|Pu'er|CN|S1
SYN|Stanton Airfield|Dennison|US|S0
SYO|Shonai Airport|Shonai|JP|M1
SYP|Ruben Cantu Airport|Santiago|PA|M0
SYQ|Tobías Bolaños International Airport|San Jose|CR|M1
SYR|Syracuse Hancock International Airport|Syracuse|US|L1
SYS|Saskylakh Airport|Saskylakh|RU|M1
SYT|Saint-Yan Airport|L'Hôpital-le-Mercier, Saône-et-Loire|FR|M0
SYU|Warraber Island Airport|Sue Islet|AU|S1
SYV|Sylvester Airport|Sylvester|US|S0
SYW|Sehwan Sharif Airport|Sehwan Sharif|PK|M0
SYX|Sanya Phoenix International Airport|Sanya (Tianya)|CN|L1
SYY|Stornoway Airport|Stornoway, Western Isles|GB|M1
SYZ|Shiraz Shahid Dastghaib International Airport|Shiraz|IR|L1
SZA|Soyo Airport|Soyo|AO|M1
SZB|Sultan Abdul Aziz Shah International Airport|Subang|MY|L1
SZE|Semera Airport|Semera|ET|S1
SZF|Samsun-Çarşamba Airport|Samsun|TR|M1
SZG|Salzburg Airport|Salzburg|AT|L1
SZH|Shuozhou Zirun Airport|Shuozhou|CN|M1
SZI|Zaysan Airport|Zaysan|KZ|S1
SZJ|Siguanea Airport|Isla de la Juventud|CU|M0
SZK|Skukuza Airport|Skukuza|ZA|M1
SZL|Whiteman Air Force Base|Knob Noster|US|M0
SZM|Sesriem Airport|Sesriem|NA|S0
SZN|Santa Cruz Island Airport|Santa Cruz Island|US|S0
SZP|Santa Paula Airport|Santa Paula|US|S0
SZS|Ryan's Creek Aerodrome|Oban|NZ|S0
SZV|Suzhou Guangfu Airport|Suzhou|CN|M0
SZX|Shenzhen Bao'an International Airport|Shenzhen|CN|L1
SZY|Olsztyn-Mazury Airport|Szymany|PL|M1
SZZ|Solidarity Szczecin–Goleniów Airport|Szczecin(Glewice)|PL|L1
TAB|A.N.R. Robinson International Airport|Scarborough|TT|L1
TAC|Daniel Z. Romualdez Airport|Tacloban City|PH|M1
TAD|Perry Stokes Airport|Trinidad|US|S0
TAE|Daegu International Airport|Daegu|KR|L1
TAF|Oran Tafraoui Airport|Tafraoui|DZ|M0
TAG|Bohol-Panglao International Airport|Panglao|PH|L1
TAH|Whitegrass Airport|Tanna Island|VU|M1
TAI|Taiz International Airport|Taiz|YE|M1
TAJ|Tadji Airport|Aitape|PG|S0
TAK|Takamatsu Airport|Takamatsu|JP|L1
TAL|Ralph M Calhoun Memorial Airport|Tanana|US|S1
TAM|General Francisco Javier Mina International Airport|Ciudad Madero|MX|M1
TAN|Tangalooma Airport||AU|S0
TAO|Qingdao Jiaodong International Airport|Qingdao (Jiaozhou)|CN|L1
TAP|Tapachula International Airport|Tapachula|MX|M1
TAQ|Tarcoola Airport|Tarcoola|AU|S0
TAR|Taranto-Grottaglie Marcello Arlotta Airport|Grottaglie|IT|M0
TAS|Tashkent International Airport|Tashkent|UZ|L1
TAT|Poprad-Tatry Airport|Poprad|SK|M1
TAU|Tauramena Airport|Tauramena|CO|S0
TAW|Tacuarembo Airport|Tacuarembo|UY|S0
TAX|Taliabu Island Airport|Tikong-Taliabu Island|ID|S0
TAY|Tartu Airport|Tartu|EE|M1
TAZ|Dashoguz International Airport|Daşoguz|TM|L1
TBB|Dong Tac Airport|Tuy Hoa|VN|M1
TBC|Tuba City Airport|Tuba City|US|S0
TBD|Timbiqui Airport|Timbiqui|CO|S0
TBE|Timbunke Airport|Timbunke|PG|S0
TBF|Tabiteuea North Airport||KI|M0
TBG|Tabubil Airport|Tabubil|PG|S1
TBH|Tugdan Airport|Tablas Island|PH|M1
TBI|New Bight Airport|Cat Island|BS|M1
TBJ|Tabarka-Aïn Draham International Airport|Tabarka|TN|M1
TBK|Timber Creek Airport||AU|S0
TBL|Tableland Homestead Airport||AU|S0
TBM|Tumbang Samba Airport|Tumbang Samba-Borneo Island|ID|S1
TBN|Waynesville-St. Robert Regional Airport-Forney Field|Fort Leonard Wood|US|M1
TBO|Tabora Airport|Tabora|TZ|S1
TBP|Captain Pedro Canga Rodríguez International Airport|Tumbes|PE|M1
TBQ|Tarabo Airport|Tarabo|PG|S0
TBR|Statesboro Bulloch County Airport|Statesboro|US|S0
TBS|Tbilisi International Airport|Tbilisi|GE|L1
TBT|Tabatinga International Airport|Tabatinga|BR|M1
TBU|Fua'amotu International Airport|Nuku'alofa|TO|L1
TBV|Tabal Airstrip|Tabal Island|MH|S0
TBW|Donskoye Airport|Tambov|RU|M0
TBX|Tambelan Airport|Tambelan|ID|S0
TBY|Tshabong Airport|Tshabong|BW|S0
TBZ|Tabriz International Airport|Tabriz|IR|L1
TCA|Tennant Creek Airport|Tennant Creek|AU|M1
TCB|Treasure Cay Airport|Treasure Cay|BS|M1
TCC|Tucumcari Municipal Airport|Tucumcari|US|M0
TCD|Tarapacá Airport|Tarapacá|CO|S1
TCE|Tulcea Danube Delta Airport|Mihail Kogălniceanu|RO|M0
TCF|Tocoa Airport|Tocoa|HN|S0
TCG|Tacheng Qianquan Airport|Tacheng|CN|S1
TCH|Tchibanga Airport|Tchibanga|GA|S0
TCJ|Torembi Airport|Torembi|PG|S0
TCK|Tinboli Airport|Tinboli|PG|S0
TCL|Tuscaloosa National Airport|Tuscaloosa|US|M0
TCM|McChord Air Force Base|Tacoma|US|M0
TCN|Tehuacán National Airport|Tehuacán|MX|S0
TCO|La Florida Airport|Tumaco|CO|M1
TCP|Taba International Airport|Taba|EG|M1
TCQ|Coronel FAP Carlos Ciriani Santa Rosa International Airport|Tacna|PE|M1
TCR|Tuticorin Airport|Vagaikulam|IN|S1
TCS|Truth or Consequences Municipal Airport|Truth or Consequences|US|M0
TCT|Takotna Airport|Takotna|US|S1
TCU|Thaba Nchu Tar Airport|Homeward|ZA|S0
TCW|Tocumwal Airport||AU|S0
TCX|Tabas Airport|Tabas|IR|M0
TCY|Terrace Bay Airport|Terrace Bay|NA|S0
TCZ|Tengchong Tuofeng Airport|Baoshan (Tengchong)|CN|M1
TDA|Trinidad Airport|Trinidad|CO|S0
TDB|Tetebedi Airport|Tetebedi|PG|S0
TDD|Teniente Av. Jorge Henrich Arauz Airport|Trinidad|BO|M1
TDG|Tandag Airport|Tandag|PH|M0
TDJ|Tadjoura Airport|Tadjoura|DJ|S0
TDK|Taldykorgan Airport|Taldykorgan|KZ|M1
TDL|Héroes de Malvinas Airport|Tandil|AR|M0
TDN|Theda Station Airport|Drysdale River|AU|S0
TDO|Ed Carlson Memorial Field South Lewis County Airport|Toledo|US|S0
TDP|Trompeteros Airport|Corrientes|PE|S0
TDR|Theodore Airport||AU|S0
TDS|Sasereme Airport|Sasereme|PG|S1
TDT|Tanda Tula Airport|Timbavati|ZA|S0
TDV|Samangoky Airport|Tanandava|MG|S0
TDW|Tradewind Airport|Amarillo|US|S0
TDX|Trat Airport|Laem Ngop|TH|M1
TDZ|Toledo Executive Airport|Toledo|US|S0
TEA|Tela Airport|Tela|HN|M0
TEB|Teterboro Airport|Teterboro|US|M1
TEC|Telêmaco Borba Airport|Telêmaco Borba|BR|M0
TED|Thisted Airport|Thisted|DK|M0
TEE|Cheikh Larbi Tébessi Airport|Tébessi|DZ|M1
TEF|Telfer Airport||AU|M0
TEG|Tenkodogo Airport|Tenkodogo|BF|S0
TEH|Tetlin Airport|Tetlin|US|S0
TEI|Tezu Airport|Tezu|IN|S0
TEK|Tatitlek Airport|Tatitlek|US|S1
TEL|Telupid Airport|Telupid|MY|S0
TEM|Temora Airport|Temora|AU|M0
TEN|Tongren Fenghuang Airport|Tongren (Daxing)|CN|M1
TEO|Terapo Airport|Terapo Mission|PG|S0
TEP|Tep Tep Airport|Teptep|PG|S0
TEQ|Tekirdağ Çorlu Airport|Çorlu|TR|M1
TER|Lajes Airport|Praia da Vitória|PT|M1
TES|Tessenei Airport|Tessenei|ER|S0
TET|Tete Airport|Tete|MZ|L1
TEU|Manapouri Airport||NZ|M0
TEV|Teruel Airport|Teruel|ES|M0
TEX|Telluride Regional Airport|Telluride|US|M1
TEY|Þingeyri Airport|Þingeyri|IS|S0
TEZ|Tezpur Airport||IN|M1
TFB|Tifalmin Airport|Tifalmin|PG|S0
TFF|Tefé Airport|Tefé|BR|M1
TFI|Tufi Airport|Tufi|PG|S1
TFL|Juscelino Kubitscheck Airport|Teófilo Otoni|BR|S0
TFM|Telefomin Airport|Telefomin|PG|S0
TFN|Tenerife Norte-Ciudad de La Laguna Airport|Tenerife|ES|L1
TFS|Tenerife Sur Airport|Tenerife|ES|L1
TFT|Taftan Airport|Taftan|PK|S0
TFU|Chengdu Tianfu International Airport|Chengdu (Jianyang)|CN|L1
TFY|Muhammad Taufiq Kiemas Airport|Krui|ID|S0
TGA|Tengah Air Base|Western Water Catchment|SG|M0
TGB|Tagbita Airstrip|Rizal|PH|S0
TGC|Tanjung Manis Airport|Belawai|MY|S0
TGD|Podgorica Airport / Podgorica Golubovci Airbase|Podgorica|ME|L1
TGG|Sultan Mahmud Airport|Kuala Terengganu|MY|M1
TGH|Tongoa Airport|Tongoa Island|VU|S1
TGI|Tingo Maria Airport|Tingo Maria|PE|S0
TGJ|Tiga Airport|Tiga|NC|M1
TGK|Taganrog Yuzhny Airport|Taganrog|RU|M0
TGL|Tagula Airport|Sudest Island|PG|S0
TGM|Târgu Mureş Transilvania International Airport|Recea|RO|M1
TGN|Latrobe Valley Airport|Morwell|AU|M0
TGO|Tongliao Airport|Tongliao|CN|M1
TGP|Podkamennaya Tunguska Airport|Bor|RU|M0
TGQ|Tangará da Serra Airport|Tangará da Serra|BR|S1
TGR|Touggourt Sidi Madhi Airport|Touggourt|DZ|M1
TGS|Chokwé Airport|Chokwé|MZ|S0
TGT|Tanga Airport|Tanga|TZ|M1
TGU|Toncontín Airport|Tegucigalpa|HN|M1
TGZ|Angel Albino Corzo International Airport|Tuxtla Gutiérrez|MX|M1
THA|Tullahoma Regional Airport William Northern Field|Tullahoma|US|S0
THB|Thaba-Tseka Airport|Thaba-Tseka|LS|S0
THC|Tchien Airport|Zwedru|LR|S0
THD|Tho Xuan Airport|Thanh Hóa|VN|S1
THE|Senador Petrônio Portela Airport|Teresina|BR|M1
THG|Thangool Airport|Biloela|AU|M1
THI|Tichitt Airport|Tichitt|MR|S0
THK|Thakhek Airport|Thakhek|LA|S0
THL|Tachileik Airport|Tachileik|MM|M1
THM|Thompson Falls Airport|Thompson Falls|US|S0
THN|Trollhättan-Vänersborg Airport|Trollhättan|SE|M1
THO|Þórshöfn Airport|Þórshöfn|IS|S1
THP|Hot Springs County Airport|Thermopolis|US|S0
THQ|Tianshui Maijishan Airport|Tianshui (Maiji)|CN|M1
THR|Mehrabad International Airport|Tehran|IR|L1
THS|Sukhothai Airport||TH|M1
THT|Tamchakett Airport|Tamchakett|MR|S0
THU|Pituffik Space Base|Pituffik|GL|M0
THV|York Airport|Thomasville|US|S0
THX|Turukhansk Airport|Turukhansk|RU|S1
THY|Thohoyandou Airport|Thohoyandou|ZA|S0
THZ|Tahoua Airport|Tahoua|NE|M0
TIA|Tirana International Airport Mother Teresa|Rinas|AL|L1
TIB|Tibú Airport|Tibú|CO|S0
TIC|Tinak Airport|Arno Atoll|MH|S0
TID|Abdelhafid Boussouf Bou Chekif Airport|Tiaret|DZ|M0
TIE|Tippi Airport|Tippi|ET|S1
TIF|Taif International Airport|Taif|SA|L1
TIH|Tikehau Airport|Tuherahera|PF|M1
TII|Tarinkot Airport|Tarinkot|AF|S0
TIJ|General Abelardo L. Rodriguez International Airport|Tijuana|MX|L1
TIK|Tinker Air Force Base|Oklahoma City|US|M0
TIL|Cheadle Airport|Cheadle|CA|S0
TIM|Mozes Kilangin Airport|Timika|ID|M1
TIN|Tindouf Airport|Tindouf|DZ|M1
TIO|Tilin Airport|Tilin|MM|S0
TIQ|Francisco Manglona Borja / Tinian International Airport|Tinian Island|MP|M1
TIR|Tirupati International Airport|Tirupati|IN|L1
TIU|Timaru Airport||NZ|M1
TIV|Tivat Airport|Tivat|ME|M1
TIW|Tacoma Narrows Airport|Tacoma|US|M1
TIX|Space Coast Regional Airport|Titusville|US|M0
TIY|Tidjikja Airport|Tidjikja|MR|S0
TIZ|Tari Airport|Tari|PG|S1
TJA|Capitan Oriel Lea Plaza Airport|Tarija|BO|M1
TJB|Raja Haji Abdullah Airport|Tanjung Balai-Karinmunbesar Island|ID|S0
TJC|Ticantiquí Airport|Ticantiquí|PA|S0
TJG|Warukin Airport|Tanta-Tabalong|ID|M1
TJH|Konotori Tajima Airport|Toyooka|JP|M1
TJI|Trujillo Airport|Trujillo|HN|M0
TJK|Tokat Airport|Tokat|TR|M1
TJL|Plínio Alarcom Airport|Três Lagoas|BR|S1
TJM|Roshchino International Airport|Tyumen|RU|L1
TJN|Takume Airport|Takume|PF|S0
TJQ|H A S Hanandjoeddin International Airport|Tanjung Pandan|ID|S1
TJS|Tanjung Harapan Airport|Tanjung Selor-Borneo Island|ID|S1
TJU|Kulob International Airport|Kulob|TJ|L1
TJV|Thanjavur Air Force Station|Thanjavur|IN|S0
TKA|Talkeetna Airport|Talkeetna|US|M0
TKB|Tekadu Airport|Tekadu|PG|S0
TKC|Tiko Airport|Tiko|CM|M0
TKD|Takoradi Airport|Sekondi-Takoradi|GH|M1
TKF|Truckee Tahoe Airport|Truckee|US|M1
TKG|Radin Inten II International Airport|Bandar Lampung|ID|M1
TKH|Takhli Royal Thai Air Force Base|Takhli|TH|M0
TKJ|Tok Junction Airport|Tok|US|S1
TKK|Chuuk International Airport|Weno Island|FM|L1
TKM|Taksimo Airport|Taksimo|RU|S1
TKN|Tokunoshima Airport|Amagi|JP|M1
TKO|Tlokoeng Airport|Tlokoeng|LS|S0
TKP|Takapoto Airport||PF|M1
TKQ|Kigoma Airport|Kigoma|TZ|S1
TKR|Thakurgaon Airport|Thakurgaon|BD|S0
TKS|Tokushima Awaodori Airport / JMSDF Tokushima Air Base|Tokushima|JP|L1
TKT|Tak Airport||TH|M0
TKU|Turku Airport|Turku|FI|L1
TKV|Tatakoto Airport|Tatakoto|PF|S1
TKW|Tekin Airport|Tekin|PG|S0
TKX|Takaroa Airport||PF|M1
TKY|Turkey Creek Airport|Turkey Creek|AU|S0
TKZ|Tokoroa Airfield|Tokoroa|NZ|S0
TLA|Teller Airport|Teller|US|S1
TLB|Tarbela Dam Airport|Tarbela|PK|S0
TLC|Adolfo López Mateos International Airport|Toluca|MX|L1
TLD|Tuli Lodge Airport|Tuli Lodge|BW|S0
TLE|Toliara Airport|Toliara|MG|M1
TLF|Telida Airport|Telida|US|S0
TLH|Tallahassee International Airport|Tallahassee|US|M1
TLI|Sultan Bantilan Airport|Toli Toli-Celebes Island|ID|S1
TLJ|Tatalina LRRS Airport|Takotna|US|M0
TLK|Talakan Airport|Talakan Oil Field|RU|S0
TLL|Lennart Meri Tallinn Airport|Tallinn|EE|L1
TLM|Zenata – Messali El Hadj Airport|Zenata|DZ|L1
TLN|Toulon-Hyères Airport|Hyères, Var|FR|M1
TLO|Tol Airport|Tol|PG|S0
TLP|Tumolbil Airport|Tumolbil|PG|S0
TLQ|Turpan Jiaohe Airport|Turpan|CN|M1
TLR|Mefford Field|Tulare|US|S0
TLS|Toulouse-Blagnac Airport|Toulouse/Blagnac|FR|L1
TLT|Tuluksak Airport|Tuluksak|US|S1
TLU|Golfo de Morrosquillo Airport|Santiago de Tolú|CO|S1
TLV|Ben Gurion International Airport|Tel Aviv|IL|L1
TLW|Talasea Airport|Talasea|PG|S0
TLX|Panguilemo Airport|Talca|CL|M0
TLY|Plastun Airport|Plastun|RU|S1
TLZ|Catalão Airport|Catalão|BR|S0
TMA|Henry Tift Myers Airport|Tifton|US|S0
TMB|Miami Executive Airport|Miami|US|M0
TMC|Tambolaka Airport|Radamata|ID|S1
TMD|Timbedra Airport|Timbedra|MR|S0
TME|Gustavo Vargas Airport|Tame|CO|M1
TMF|Thimarafushi Airport|Thimarafushi|MV|S1
TMG|Tomanggong Airport|Tomanggong|MY|S1
TMH|Tanah Merah Airport|Tanah Merah|ID|M1
TMI|Tumling Tar Airport|Tumling Tar|NP|S1
TMJ|Termez Airport|Termez|UZ|M1
TML|Yakubu Tali International Airport|Tamale|GH|L1
TMM|Toamasina Ambalamanasy Airport|Toamasina|MG|L1
TMN|Tamana Island Airport|Tamana Island|KI|S0
TMO|Tumeremo Airport||VE|M0
TMP|Tampere-Pirkkala Airport|Tampere / Pirkkala|FI|L1
TMQ|Tambao Airport|Tambao|BF|S0
TMR|Aguenar – Hadj Bey Akhamok Airport|Tamanrasset|DZ|L1
TMS|São Tomé International Airport|São Tomé|ST|L1
TMT|Trombetas Airport|Oriximiná|BR|M1
TMU|Tambor Airport|Nicoya|CR|S0
TMW|Tamworth Airport|Tamworth|AU|M1
TMX|Timimoun Airport|Timimoun|DZ|M1
TMY|Tiom Airport|Tiom-Papua Island|ID|S0
TMZ|Thames Aerodrome||NZ|S0
TNA|Jinan Yaoqiang International Airport|Jinan (Licheng)|CN|L1
TNB|Tanah Grogot Airport|Tanah Grogot|ID|S0
TNC|Tin City Long Range Radar Station Airport|Tin City|US|S1
TND|Alberto Delgado Airport|Trinidad|CU|M1
TNE|New Tanegashima Airport|Tanegashima|JP|M1
TNF|Toussus-le-Noble Airport|Toussus-le-Noble, Yvelines|FR|M0
TNG|Tangier Ibn Battuta Airport|Tangier|MA|L1
TNH|Tonghua Sanyuanpu Airport|Tonghua|CN|M1
TNI|Satna Airport||IN|S0
TNJ|Raja Haji Fisabilillah International Airport|Tanjung Pinang-Bintan Island|ID|M1
TNK|Tununak Airport|Tununak|US|S1
TNL|Ternopil International Airport|Ternopil|UA|S0
TNM|Teniente Rodolfo Marsh Martin Airport|Villa Las Estrellas|AQ|S0
TNN|Tainan International Airport / Tainan Air Base|Tainan (Rende)|TW|L1
TNO|Tamarindo Airport|Tamarindo|CR|S0
TNP|Twentynine Palms Airport|Twentynine Palms|US|S0
TNQ|Washington Island Airstrip|Teraina|KI|S0
TNR|Ivato International Airport|Antananarivo|MG|L1
TNS|Tungsten (Cantung) Airport|Tungsten|CA|S0
TNT|Dade Collier Training and Transition Airport|Miami|US|S0
TNU|Newton Municipal Airport|Newton|US|S0
TNV|Tabuaeran Island Airport|Tabuaeran Island|KI|S0
TNW|Jumandy Airport|Ahuano|EC|M0
TNZ|Tosontsengel Airport|Tosontsengel|MN|S0
TOA|Zamperini Field|Torrance|US|S0
TOB|Tobruk International Airport|Adam|LY|S0
TOC|Toccoa Airport - R.G. Letourneau Field|Toccoa|US|S0
TOD|Tioman Airport|Tioman Island|MY|M1
TOE|Tozeur Nefta International Airport|Tozeur|TN|M1
TOF|Tomsk Kamov Airport|Tomsk|RU|L1
TOG|Togiak Airport|Togiak Village|US|S1
TOH|Torres Airstrip|Loh/Linua|VU|S0
TOI|Troy Municipal Airport at N Kenneth Campbell Field|Troy|US|M0
TOJ|Madrid–Torrejón Airport / Torrejón Air Base|Madrid|ES|M0
TOK|Torokina Airport|Torokina|PG|S0
TOL|Eugene F. Kranz Toledo Express Airport|Toledo|US|M1
TOM|Tombouktou Airport|Timbuktu|ML|L1
TON|Tonu Airport|Tonu|PG|S0
TOO|San Vito de Java Airport|Coto Brus|CR|S0
TOP|Philip Billard Municipal Airport|Topeka|US|M0
TOQ|Barriles Airport|Tocopilla|CL|M0
TOR|Torrington Municipal Airport|Torrington|US|S0
TOS|Tromsø Airport|Tromsø|NO|L1
TOT|Totness Airport|Totness|SR|S0
TOU|Touho Airport|Touho|NC|M1
TOW|Toledo - Luiz Dalcanale Filho Municipal Airport|Toledo|BR|S1
TOX|Tobolsk Airport|Tobolsk|RU|S0
TOY|Toyama Kitokito Airport|Toyama|JP|M1
TOZ|Mahana Airport|Touba|CI|S0
TPA|Tampa International Airport|Tampa|US|L1
TPC|Tarapoa Airport|Tarapoa|EC|M0
TPE|Taiwan Taoyuan International Airport|Taoyuan|TW|L1
TPF|Peter O Knight Airport|Tampa|US|S0
TPG|Taiping (Tekah) Airport|Taiping|MY|S0
TPH|Tonopah Airport|Tonopah|US|M0
TPI|Tapini Airport|Tapini|PG|S1
TPJ|Taplejung Airport|Taplejung|NP|M1
TPK|Teuku Cut Ali Airport|Tapaktuan|ID|S0
TPL|Draughon Miller Central Texas Regional Airport|Temple|US|M0
TPN|Tiputini Airport|Tiputini|EC|S0
TPP|Cadete FAP Guillermo Del Castillo Paredes Airport|Tarapoto|PE|M1
TPQ|Amado Nervo National Airport|Tepic|MX|M1
TPR|Tom Price Airport|Tom Price|AU|S0
TPS|Vincenzo Florio Airport Trapani-Birgi|Trapani (TP)|IT|M1
TPT|Tapeta Airport|Tapeta|LR|S0
TPU|Tikapur Airport|Tikapur|NP|S0
TPX|Tupai Airport|Tupai Atoll|PF|S0
TQD|Al Taqaddum Air Base|Al Habbaniyah|IQ|M0
TQL|Tarko-Sale Airport|Tarko-Sale|RU|S0
TQN|Taleqan Airport|Taleqan|AF|S0
TQO|Felipe Carrillo Puerto International Airport Tulum|Tulum|MX|L1
TQP|Trepell Airport|Trepell|AU|S0
TQQ|Maranggo Airport|Waha-Tomea Island|ID|S0
TQS|Captain Ernesto Esguerra Cubides Air Base|Tres Esquinas|CO|M0
TRA|Tarama Airport|Tarama|JP|M1
TRC|Francisco Sarabia Tinoco International Airport|Torreón|MX|M1
TRD|Trondheim Airport, Værnes|Trondheim|NO|L1
TRE|Tiree Airport|Balemartine, Argyll and Bute|GB|M1
TRF|Sandefjord Airport, Torp|Sandefjord(Torp)|NO|L1
TRG|Tauranga Airport|Tauranga|NZ|M1
TRH|Trona Airport|Trona|US|S0
TRI|Tri-Cities Regional TN/VA Airport|Blountville|US|M1
TRJ|Tarakbits Airport|Tarakbits|PG|S0
TRK|Juwata International Airport / Suharnoko Harbani AFB|Tarakan|ID|M1
TRL|Terrell Municipal Airport|Terrell|US|S0
TRM|Jacqueline Cochran Regional Airport|Palm Springs|US|M0
TRN|Turin Airport|Caselle Torinese (TO)|IT|L1
TRO|Taree Airport|Taree|AU|M0
TRQ|Tarauacá Airport|Tarauacá|BR|M0
TRR|China Bay Airport|Trincomalee|LK|M1
TRS|Trieste Airport|Ronchi dei Legionari/Trieste|IT|L1
TRT|Toraja Airport|Toraja|ID|M1
TRU|Capitán FAP Carlos Martínez de Pinillos International Airport|Trujillo|PE|L1
TRV|Thiruvananthapuram International Airport|Thiruvananthapuram|IN|L1
TRW|Bonriki International Airport|South Tarawa|KI|L1
TRX|Trenton Municipal Airport|Trenton|US|S0
TRY|Tororo Airport|Tororo|UG|S0
TRZ|Tiruchirappalli International Airport|Tiruchirappalli|IN|L1
TSA|Taipei Songshan International Airport|Taipei (Songshan)|TW|L1
TSB|Tsumeb Airport|Tsumeb|NA|M0
TSC|Taisha Airport|Taisha|EC|S0
TSD|Tshipise Airport|Tshipise|ZA|S0
TSF|Treviso Airport|Treviso (TV)|IT|L1
TSG|Tanacross Airport|Tanacross|US|S0
TSH|Tshikapa Airport|Tshikapa|CD|S0
TSI|Tsile Tsile Airport|Tsile Tsile|PG|S0
TSJ|Tsushima Airport|Tsushima|JP|M1
TSL|Tamuín National Airport|Tamuín|MX|S0
TSM|Taos Regional Airport|Taos|US|M1
TSN|Tianjin Binhai International Airport|Tianjin|CN|L1
TSP|Tehachapi Municipal Airport|Tehachapi|US|S0
TSQ|Torres Airport|Torres|BR|S0
TSR|Timișoara Traian Vuia International Airport|Timişoara|RO|L1
TST|Trang Airport|Trang|TH|M1
TSU|Tabiteuea South Airport|Tabiteuea South|KI|S0
TSV|Townsville Airport / RAAF Base Townsville|Townsville|AU|M1
TSW|Tsewi Airport|Tsewi|PG|S0
TSY|Wiriadinata Airport|Cibeureum, Tasikmalaya-Java Island|ID|S0
TSZ|Tsetserleg Airport|Tsetserleg|MN|S0
TTA|Tan Tan Airport|Tan Tan|MA|M1
TTC|Las Breas Airport|Taltal|CL|M0
TTD|Portland Troutdale Airport|Portland|US|M0
TTE|Sultan Babullah Airport|Ternate|ID|M1
TTG|General Enrique Mosconi Airport|Tartagal|AR|M0
TTH|Thumrait Air Base|Thumrait|OM|M0
TTI|Tetiaroa Airport|Tetiaroa|PF|S0
TTJ|Tottori Sand Dunes Conan Airport|Tottori|JP|M1
TTM|Tablón De Tamara Airport|Tablón De Tamara|CO|S0
TTN|Trenton Mercer Airport|Ewing Township|US|M1
TTO|Britton Municipal Airport|Britton|US|S0
TTQ|Tortuguero Airport|Tortuguero|CR|S0
TTR|Pongtiku Airport|Makale|ID|S0
TTS|Tsaratanana Airport|Tsaratanana|MG|S1
TTT|Taitung Airport|Taitung City|TW|M1
TTU|Sania Ramel Airport|Tétouan|MA|L1
TTX|Truscott-Mungalalu Airport|Anjo Peninsula|AU|S0
TUA|Lieutenant Colonel Luis A. Mantilla International Airport|Tulcán|EC|M1
TUB|Tubuai Airport||PF|M1
TUC|Teniente Benjamín Matienzo International Airport|San Miguel de Tucumán|AR|L1
TUD|Tambacounda Airport|Tambacounda|SN|M0
TUF|Tours Val de Loire Airport|Tours, Indre-et-Loire|FR|M1
TUG|Tuguegarao Airport|Tuguegarao City|PH|M1
TUH|Arnold Air Force Base|Manchester|US|S0
TUI|Turaif Domestic Airport|Turaif|SA|M1
TUJ|Tum Airport|Tum|ET|S0
TUK|Turbat International Airport|Turbat|PK|L1
TUL|Tulsa International Airport|Tulsa|US|L1
TUM|Tumut Aerodrome|Tumut|AU|M0
TUN|Tunis Carthage International Airport|Tunis|TN|L1
TUO|Taupo Airport|Taupo|NZ|M1
TUP|Tupelo Regional Airport|Tupelo|US|M1
TUQ|Tougan Airport|Tougan|BF|S0
TUR|Tucuruí Airport|Tucuruí|BR|M1
TUS|Tucson International Airport|Tucson|US|L1
TUU|Prince Sultan bin Abdulaziz International Airport|Tabuk|SA|L1
TUV|Tucupita Airport|Tucupita|VE|M0
TUW|Tubualá Airport|Coetupo|PA|S0
TUX|Tumbler Ridge Airport|Tumbler Ridge|CA|S0
TUY|Base Aeronaval de Tulum|Tulum|MX|S0
TVA|Morafenobe Airport|Morafenobe|MG|S0
TVC|Cherry Capital Airport|Traverse City|US|M1
TVF|Thief River Falls Regional Airport|Thief River Falls|US|M1
TVI|Thomasville Regional Airport|Thomasville|US|S0
TVL|Lake Tahoe Airport|South Lake Tahoe|US|M0
TVS|Tangshan Sannühe Airport|Tangshan (Fengrun)|CN|S1
TVT|Tashkent-Khumo International Airport|Tashkent|UZ|M1
TVU|Matei Airport|Matei|FJ|S1
TVY|Dawei Airport|Dawei|MM|M1
TWA|Twin Hills Airport|Twin Hills|US|S1
TWB|Toowoomba Airport|Toowoomba|AU|S0
TWC|Tumxuk Tangwangcheng Airport|Tumxuk|CN|S1
TWD|Jefferson County International Airport|Port Townsend|US|S0
TWE|Taylor Airport|Taylor|US|S0
TWF|Joslin Field Magic Valley Regional Airport|Twin Falls|US|M1
TWP|Torwood Airport|Torwood|AU|S0
TWT|Sanga Sanga Airport|Bongao|PH|M1
TWU|Tawau Airport|Tawau|MY|M1
TWY|Tawa Airport|Tawa|PG|S0
TWZ|Pukaki Airport|Twitzel|NZ|M0
TXC|Orsha Airport - Balbasovo Air Base|Orsha|BY|M0
TXE|Rembele Airport|Takengon|ID|M1
TXF|9 de Maio - Teixeira de Freitas Airport|Teixeira de Freitas|BR|S0
TXK|Texarkana Regional Airport (Webb Field)|Texarkana|US|M1
TXM|Teminabuan Airport|Atinjoe|ID|S0
TXN|Huangshan Tunxi International Airport|Huangshan|CN|L1
TXR|Tanbar Airport|Tanbar Station|AU|S0
TXU|Tabou Airport|Tabou|CI|S0
TYA|Klokovo Air Base|Tula|RU|S0
TYB|Tibooburra Airport||AU|M0
TYC|Taiyuan Yaocheng Airport|Taiyuan|CN|S0
TYD|Tynda Airport|Tynda|RU|S0
TYE|Tyonek Airport|Tyonek|US|S0
TYF|Torsby Airport|Torsby|SE|M1
TYG|Thylungra Airport||AU|S0
TYL|Captain Victor Montes Arias International Airport|Talara|PE|M1
TYM|Staniel Cay Airport|Staniel Cay|BS|M0
TYN|Taiyuan Wusu International Airport|Taiyuan|CN|L1
TYP|Tobermorey Airport|Tobermorey|AU|S0
TYR|Tyler Pounds Regional Airport|Tyler|US|M1
TYS|McGhee Tyson Airport|Knoxville/Maryville|US|L1
TYT|Treinta y Tres Airport|Treinta y Tres|UY|S0
TYZ|Taylor Airport|Taylor|US|S0
TZA|Sir Barry Bowen Municipal Airport|Belize City|BZ|M1
TZC|Tuscola Area Airport|Caro|US|S0
TZL|Tuzla International Airport|Dubrave Gornje|BA|L1
TZM|Aeródromo de Cupul|Tizimin|MX|S0
TZN|Congo Town Airport|Andros|BS|M1
TZO|Tsimiroro Airport|Ankisatra|MG|S0
TZX|Trabzon International Airport|Trabzon|TR|M1
UAB|İncirlik Air Base|Sarıçam|TR|M0
UAC|San Luis Río Colorado Airport|San Luis Río Colorado|MX|S0
UAE|Mount Aue Airport|Aue|PG|S0
UAH|Ua Huka Airport|Ua Huka|PF|S1
UAI|Commander in Chief of FALINTIL, Kay Rala Xanana Gusmão, International Airport|Suai|TL|M1
UAL|Luau Airport|Luau|AO|S0
UAM|Andersen Air Force Base|Yigo|GU|M0
UAP|Ua Pou Airport|Ua Pou|PF|S1
UAQ|Domingo Faustino Sarmiento Airport|San Juan|AR|M1
UAR|Bouarfa Airport|Bouarfa|MA|M1
UAS|Samburu Airport|Isiolo West|KE|S0
UAX|Uaxactun Airport|Uaxactun|GT|S0
UBA|Mário de Almeida Franco Airport|Uberaba|BR|M1
UBB|Mabuiag Island Airport|Mabuiag Island|AU|S1
UBI|Buin Airport|Buin|PG|S0
UBJ|Yamaguchi Ube Airport|Ube|JP|M1
UBN|Ulaanbaatar Chinggis Khaan International Airport|Ulaanbaatar (Sergelen)|MN|L1
UBP|Ubon Ratchathani Airport|Ubon Ratchathani|TH|M1
UBS|Columbus Lowndes County Airport|Columbus|US|S0
UBT|Ubatuba Gastão Madeira State Airport|Ubatuba|BR|S0
UBU|Kalumburu Airport|Kalumburu|AU|S0
UCB|Ulanqab Jining Airport|Ulanqab|CN|M1
UCC|Yucca Airstrip|Mercury|US|S0
UCE|Eunice Airport|Eunice|US|S0
UCK|Lutsk Airport|Lutsk|UA|S0
UCN|Buchanan Airport|Buchanan|LR|S0
UCT|Ukhta Airport|Ukhta|RU|M1
UCY|Everett-Stewart Regional Airport|Union City|US|S0
UCZ|Uchiza Airport|Uchiza|PE|S0
UDA|Undara Airport|Undara|AU|S0
UDD|Bermuda Dunes Airport|Bermuda Dunes|US|S0
UDE|Volkel Air Base|Uden|NL|M0
UDI|Ten. Cel. Aviador César Bombonato Airport|Uberlândia|BR|M1
UDJ|Uzhhorod International Airport|Uzhhorod|UA|M0
UDR|Maharana Pratap Airport|Udaipur|IN|M1
UEE|Queenstown Airport||AU|S0
UEL|Quelimane Airport|Quelimane|MZ|M1
UEN|Urengoy Airport|Urengoy|RU|S0
UEO|Kumejima Airport|Kumejima|JP|M1
UES|Waukesha County Airport|Waukesha|US|S0
UET|Quetta International Airport|Quetta|PK|L1
UFA|Ufa International Airport|Ufa|RU|L1
UGA|Bulgan Airport|Bulgan|MN|M1
UGB|Ugashik Bay Airport|Pilot Point|US|S0
UGC|Urgench International Airport|Urgench|UZ|L1
UGL|Union Glacier Blue-Ice Runway|Union Glacier|AQ|S0
UGN|Waukegan National Airport|Chicago/Waukegan|US|S0
UGO|Uige Airport|Uige|AO|M0
UGS|Ugashik Airport|Ugashik|US|S0
UGT|Bulagtai Resort Airport|Khankhongor|MN|S0
UGU|Bilorai Airport|Bilogai|ID|M1
UHE|Kunovice Airport|Uherské Hradiště|CZ|M0
UHS|Aleksandrovsk-Sakhalinskiy Airport|Aleksandrovsk-Sakhalinskiy|RU|S0
UIB|El Caraño Airport|Quibdó|CO|M1
UIH|Phu Cat Airport|Quy Nohn|VN|M1
UII|Utila Airport|Utila Island|HN|S1
UIK|Ust-Ilimsk Airport|Ust-Ilimsk|RU|S0
UIL|Quillayute Airport|Quillayute|US|S0
UIN|Quincy Regional Airport Baldwin Field|Quincy|US|M1
UIO|Mariscal Sucre International Airport|Quito|EC|L1
UIP|Quimper-Cornouaille Airport|Quimper/Pluguffan|FR|M0
UIR|Quirindi Airport||AU|S0
UIT|Jaluit Airport|Jabor Jaluit Atoll|MH|S1
UJE|Ujae Atoll Airport|Ujae Atoll|MH|S1
UJN|Uljin Airport|Bongsan-ri, Uljin|KR|S0
UJU|Uiju Airport|Uiju|KP|S0
UKA|Ukunda Airstrip|Ukunda|KE|S0
UKB|Kobe Airport|Kobe|JP|L1
UKE|Utkela Airport|Bhawanipatna|IN|M1
UKG|Ust-Kuyga Airport|Ust-Kuyga|RU|S1
UKH|Mukhaizna Airport|Mukhaizna Oil Field|OM|S0
UKI|Ukiah Municipal Airport|Ukiah|US|M0
UKK|Oskemen International Airport|Ust-Kamenogorsk (Oskemen)|KZ|L1
UKN|Waukon Municipal Airport|Waukon|US|S0
UKR|Mukeiras Airport|Mukayras|YE|S0
UKS|Sevastopol International Airport / Belbek Air Base|Sevastopol|UA|M0
UKT|Quakertown Airport|Quakertown|US|S0
UKU|Nuku Airport|Nuku|PG|S0
UKX|Ust-Kut Airport|Ust-Kut|RU|M1
ULA|Capitan D Daniel Vazquez Airport|San Julian|AR|M0
ULB|Uléi Airport|Ambrym Island|VU|S0
ULD|Prince Mangosuthu Buthelezi Airport|Ulundi|ZA|M0
ULE|Sule Airport|Sule|PG|S0
ULG|Ölgii Mongolei International Airport|Ölgii|MN|M1
ULH|Al-Ula International Airport|Al-Ula|SA|L1
ULI|Ulithi Airport|Falalop Island|FM|S0
ULK|Lensk Airport|Lensk|RU|M1
ULM|New Ulm Municipal Airport|New Ulm|US|S0
ULN|Buyant-Ukhaa International Airport|Ulaanbaatar|MN|L0
ULO|Ulaangom Airport|Ulaangom|MN|M1
ULP|Quilpie Airport||AU|M1
ULQ|Heriberto Gíl Martínez Airport|Tuluá|CO|M0
ULS|Mulatos Airport|Mulatos|CO|S0
ULU|Gulu Airport|Gulu|UG|M1
ULV|Ulyanovsk Baratayevka Airport|Ulyanovsk|RU|M1
ULX|Ulusaba Airport|Ulusaba|ZA|S0
ULY|Ulyanovsk Vostochny Airport|Cherdakly|RU|M1
ULZ|Donoi Airport|Uliastai|MN|S1
UMA|Alfredo Noa Díaz Airport|Maisí|CU|S0
UMB|Kalumbila Airport|Kalumbila|ZM|M0
UMC|Umba Airport|Umba|PG|S0
UME|Umeå Airport|Umeå|SE|L1
UMI|Quincemil Air Base|Quince Mil|PE|S0
UMM|Summit Airport|Cantwell|US|S0
UMR|Woomera Airfield|Woomera|AU|S0
UMS|Ust-Maya Airport|Ust-Maya|RU|S1
UMT|Umiat Airport|Umiat|US|S0
UMU|Orlando de Carvalho Airport|Umuarama|BR|S1
UMY|Sumy Airport|Sumy|UA|S0
UMZ|Mena Intermountain Municipal Airport|Mena|US|S0
UNA|Una-Comandatuba Airport|Una|BR|S1
UNC|Unguía Airport|Unguía|CO|S0
UND|Kunduz Airport|Kunduz|AF|M0
UNE|Qacha's Nek Airport|Qacha's Nek|LS|S0
UNG|Kiunga Airport|Kiunga|PG|S1
UNI|Union Island International Airport|Union Island|VC|M1
UNK|Unalakleet Airport|Unalakleet|US|M1
UNN|Ranong Airport|Ranong|TH|M1
UNR|Öndörkhaan Airport|Öndörkhaan|MN|S0
UNU|Dodge County Airport|Juneau|US|S0
UOA|Moruroa Airport|Moruroa Atoll|PF|S0
UOL|Buol - Pogogul Airport|Buol|ID|S1
UOS|Franklin County Airport|Sewanee|US|S0
UOX|University Oxford Airport|Oxford|US|M0
UPB|Playa Baracoa Airport|Havana|CU|M0
UPG|Sultan Hasanuddin International Airport|Makassar|ID|L1
UPL|Upala Airport|Upala|CR|M0
UPN|Uruapan - Licenciado y General Ignacio Lopez Rayon International Airport|Uruapan|MX|M1
UPP|Upolu Airport|Hawi|US|S0
UPR|Upiara Airport|Upiara|PG|S0
UPV|Upavon Aerodrome|Pewsey, Wiltshire|GB|S0
URA|Manshuk Mametova International Airport|Uralsk|KZ|L1
URC|Ürümqi Tianshan International Airport|Ürümqi|CN|L1
URD|Burg Feuerstein Airport|Ebermannstadt|DE|S0
URE|Kuressaare Airport|Kuressaare|EE|M1
URG|Rubem Berta Airport|Uruguaiana|BR|M1
URI|Uribe Airport|La Uribe|CO|S0
URJ|Uray Airport|Uray|RU|M1
URM|Uriman Airport|Urimán|VE|S0
URN|Urgun Airport|Urgun|AF|S0
URO|Rouen Vallée de Seine Airport|Boos|FR|M0
URR|Urrao Airport|Urrao|CO|S0
URS|Kursk East Airport|Kursk|RU|M0
URT|Surat Thani Airport|Surat Thani|TH|M1
URU|Uroubi Airport|Uroubi|PG|S0
URY|Gurayat Domestic Airport|Gurayat|SA|M1
URZ|Orūzgān Airport|Orūzgān|AF|S0
USA|Concord-Padgett Regional Airport|Concord|US|M1
USC|Union County, Troy Shelton Field|Union|US|S0
USH|Ushuaia - Malvinas Argentinas International Airport|Ushuaia|AR|M1
USI|Mabaruma Airport|Mabaruma|GY|S0
USJ|Usharal Airport|Usharal|KZ|S1
USK|Usinsk Airport|Usinsk|RU|M1
USL|Useless Loop Airport|Useless Loop|AU|S0
USM|Samui International Airport|Na Thon (Ko Samui Island)|TH|L1
USN|Ulsan Airport|Ulsan|KR|M1
USQ|Uşak Airport|Uşak|TR|M0
USR|Ust-Nera Airport|Ust-Nera|RU|M1
USS|Sancti Spiritus Airport|Sancti Spiritus|CU|S0
UST|Northeast Florida Regional Airport|St Augustine|US|M1
USU|Francisco B. Reyes (Busuanga) Airport|Coron|PH|M1
UTA|Mutare Airport|Mutare|ZW|S0
UTB|Muttaburra Airport||AU|S0
UTD|Nutwood Downs Airport|Nutwood Downs|AU|S0
UTE|Bultfontein Airport|Bultfontein|ZA|S0
UTG|Quthing Airport|Quthing|LS|S0
UTH|Udon Thani International Airport|Udon Thani|TH|L1
UTI|Utti Air Base|Utti / Valkeala|FI|M0
UTK|Utirik Airport|Utirik Island|MH|S1
UTM|Tunica Municipal Airport|Tunica|US|S0
UTN|Upington Airport|Upington|ZA|M1
UTO|Indian Mountain LRRS Airport|Utopia Creek|US|M1
UTP|U-Tapao–Rayong–Pattaya International Airport|Rayong|TH|L1
UTS|Ust-Tsylma Airport|Ust-Tsylma|RU|M0
UTT|K. D. Matanzima Airport|Mthatha|ZA|M1
UTU|Ustupu Airport|Ustupu|PA|S0
UTW|Queenstown Airport|Queenstown|ZA|M0
UUA|Bugulma Airport|Bugulma|RU|M1
UUD|Baikal International Airport|Ulan Ude|RU|L1
UUK|Ugnu-Kuparuk Airport|Kuparuk|US|S0
UUN|Baruun Urt Airport||MN|M0
UUS|Yuzhno-Sakhalinsk International Airport|Yuzhno-Sakhalinsk|RU|L1
UUU|Manumu Airport|Manumu|PG|S0
UVA|Garner Field|Uvalde|US|S0
UVE|Ouvéa Airport|Ouvéa|NC|M1
UVF|Hewanorra International Airport|Vieux Fort|LC|L1
UVI|José Cleto Airport|União da Vitória|BR|S1
UVL|El Kharja Airport|Kharja Oases|EG|S0
UVO|Uvol Airport|Uvol|PG|S0
UWA|Ware Airport|Ware|US|S0
UYL|Nyala Airport|Nyala|SD|M1
UYN|Yulin Yuyang Airport|Yulin|CN|M1
UYU|Joya Andina International Airport|Quijarro|BO|L1
UZC|Ponikve Airport|Stapari|RS|M0
UZM|Hope Bay Aerodrome|Hope Bay|CA|S0
UZR|Urzhar Airport|Urzhar|KZ|S1
UZU|Curuzu Cuatia Airport|Curuzu Cuatia|AR|M0
VAA|Vaasa Airport|Vaasa|FI|L1
VAB|Yavarate Airport|Yavarate|CO|S0
VAC|Varrelbusch Airfield|Cloppenburg|DE|S0
VAD|Moody Air Force Base|Valdosta|US|M0
VAF|Valence-Chabeuil Airport|Chabeuil, Drôme|FR|M0
VAG|Major Brigadeiro Trompowsky Airport|Varginha|BR|M0
VAH|Capitán Av. Vidal Villagomez Toledo Airport|Vallegrande|BO|S0
VAI|Vanimo Airport|Vanimo|PG|M1
VAK|Chevak Airport|Chevak|US|S1
VAL|Valença Airport|Valença|BR|S1
VAM|Villa International Airport Maamigili|Maamigili|MV|M1
VAN|Van Ferit Melen Airport|Van|TR|M1
VAO|Suavanao Airport|Suavanao|SB|S1
VAP|Rodelillo Airport|Viña Del Mar|CL|S0
VAQ|Vanavara Airport|Vanavara|RU|M1
VAR|Varna Airport|Varna|BG|L1
VAS|Sivas Nuri Demirağ Airport|Sivas|TR|M1
VAT|Vatomandry Airport|Vatomandry|MG|S0
VAV|Vava'u International Airport|Vava'u Island|TO|L1
VAW|Vardø Airport, Svartnes|Vardø|NO|M1
VBA|Ann Airport|Aeng|MM|S0
VBC|Chanmyathazi Airport|Mandalay|MM|S0
VBG|Vandenberg Space Force Base|Lompoc|US|M0
VBP|Bokpyinn Airport|Bokpyinn|MM|S0
VBS|Brescia Gabriele d'Annunzio Airport|Montichiari (BS)|IT|M1
VBV|Vanua Balavu Airport|Vanua Balavu|FJ|S1
VBY|Visby Airport|Visby|SE|L1
VCA|Can Tho International Airport|Can Tho|VN|L1
VCC|Vacaria Airport|Vacaria|BR|S0
VCD|Victoria River Downs Airport|Victoria River|AU|S0
VCE|Venice Marco Polo Airport|Venezia (VE)|IT|L1
VCF|Valcheta Airport|Valcheta|AR|S0
VCH|Vichadero Airport|Vichadero|UY|S0
VCL|Chu Lai Airport|Tam Nghĩa|VN|S1
VCP|Viracopos International Airport|Campinas|BR|L1
VCS|Con Dao Airport|Con Dao|VN|M1
VCT|Victoria Regional Airport|Victoria|US|M1
VCV|Southern California Logistics Airport|Victorville|US|S0
VDA|Ovda Airport|Eilat|IL|S0
VDC|Glauber de Andrade Rocha Airport|Vitória da Conquista|BR|M1
VDE|El Hierro Airport|El Hierro Island|ES|M1
VDH|Dong Hoi Airport|Dong Hoi|VN|M1
VDI|Vidalia Regional Airport|Vidalia|US|S0
VDM|Gobernador Castello Airport|Viedma / Carmen de Patagones|AR|M1
VDO|Van Don International Airport|Van Don|VN|M1
VDP|Valle de La Pascua Airport||VE|M0
VDR|Villa Dolores Airport|Villa Dolores|AR|M0
VDS|Vadsø Airport|Vadsø|NO|M1
VDY|Jindal Vijaynagar Airport|Toranagallu|IN|S0
VDZ|Valdez Pioneer Field|Valdez|US|M1
VEE|Venetie Airport|Venetie|US|S1
VEG|Maikwak Airport|Maikwak|GY|S0
VEL|Vernal Regional Airport|Vernal|US|M1
VEO|Severo-Yeniseysk Airport|Severo-Yeniseysk|RU|M1
VER|General Heriberto Jara International Airport|Veracruz|MX|L1
VEV|Barakoma Airport|Barakoma|SB|S0
VEX|Tioga Municipal Airport|Tioga|US|S0
VEY|Vestmannaeyjar Airport|Vestmannaeyjar|IS|M0
VFA|Victoria Falls International Airport|Victoria Falls|ZW|L1
VGA|Vijayawada International Airport|Vijayawada|IN|L1
VGD|Vologda Airport|Vologda|RU|M0
VGO|Vigo Airport|Vigo|ES|M1
VGS|General Villegas Airport|General Villegas|AR|S0
VGT|North Las Vegas Airport|Las Vegas|US|M0
VGZ|Villa Garzón Airport|Villa Garzón|CO|S0
VHC|Saurimo Airport|Saurimo|AO|M0
VHM|Vilhelmina South Lapland Airport|Vilhelmina|SE|M1
VHN|Culberson County Airport|Van Horn|US|S0
VHV|Verkhnevilyuisk Airport|Verkhnevilyuisk|RU|S1
VHY|Vichy-Charmeil Airport|Charmeil, Allier|FR|M0
VHZ|Vahitahi Airport|Vahitahi|PF|S0
VIA|Videira Airport|Videira|BR|S0
VIE|Vienna International Airport|Vienna|AT|L1
VIG|Juan Pablo Pérez Alfonso Airport|El Vigía|VE|M1
VIH|Rolla National Airport|Vichy|US|S0
VII|Vinh Airport|Vinh|VN|M1
VIJ|Virgin Gorda Airport|Spanish Town|VG|M1
VIL|Dakhla Airport|Dakhla|EH|L1
VIN|Vinnytsia/Gavyryshivka International Airport|Vinnitsa|UA|M0
VIP|Payerne Air Base|Payerne|CH|M0
VIQ|Viqueque Airport|Viqueque|TL|S0
VIR|Virginia Airport|Durban|ZA|M0
VIS|Visalia Municipal Airport|Visalia|US|M0
VIT|Vitoria Airport|Alava|ES|M1
VIU|Viru Harbour Airstrip|Viru|SB|S0
VIV|Vivigani Airfield|Vivigani|PG|S0
VIX|Eurico de Aguiar Salles International Airport|Vitória|BR|L1
VIY|Vélizy-Villacoublay Air Base|Vélizy-Villacoublay, Yvelines|FR|M0
VJB|Xai-Xai Chongoene Airport|Xai-Xai|MZ|S1
VJI|Virginia Highlands Airport|Abingdon|US|S0
VJQ|Gurue Airport|Gurue|MZ|S0
VKG|Rach Gia Airport|Rach Gia|VN|M1
VKO|Vnukovo International Airport|Moscow|RU|L1
VKS|Vicksburg Municipal Airport|Vicksburg|US|S0
VKT|Vorkuta Airport|Vorkuta|RU|M1
VKV|Vaskovo Airport|Arkhangelsk|RU|M0
VLA|Vandalia Municipal Airport|Vandalia|US|S0
VLC|Valencia Airport|Valencia|ES|L1
VLD|Valdosta Regional Airport|Valdosta|US|M1
VLE|Valle Airport|Grand Canyon|US|S0
VLG|Villa Gesell Airport|Villa Gesell|AR|M0
VLI|Bauerfield International Airport|Port Vila|VU|L1
VLL|Valladolid Airport|Valladolid|ES|M1
VLM|Teniente Coronel Rafael Pabón Airport|Villamontes|BO|M0
VLN|Arturo Michelena International Airport|Valencia|VE|L1
VLP|Vila Rica Airport|Vila Rica|BR|S0
VLR|Vallenar Airport|Vallenar|CL|M0
VLS|Valesdir Airport|Epi Island|VU|S1
VLU|Velikiye Luki Airport|Velikiye Luki|RU|M0
VLV|Dr. Antonio Nicolás Briceño Airport|Valera|VE|M1
VLY|Anglesey Airport|Angelsey|GB|M0
VME|Villa Reynolds Airport|Villa Mercedes|AR|M0
VMI|Doctor Juan Plate National Airport|Puerto Vallemi|PY|M0
VMU|Baimuru Airport|Baimuru|PG|M1
VNA|Salavan Airport|Salavan|LA|S0
VNC|Venice Municipal Airport|Venice|US|S0
VND|Vangaindrano Airport|Vangaindrano|MG|S0
VNE|Vannes-Meucon Airport|Vannes/Meucon|FR|M0
VNO|Vilnius International Airport|Vilnius|LT|L1
VNR|Vanrook Station Airport||AU|S0
VNS|Lal Bahadur Shastri International Airport|Varanasi|IN|L1
VNT|Ventspils International Airport|Ventspils|LV|S0
VNX|Vilankulo Airport|Vilanculo|MZ|M1
VNY|Van Nuys Airport|Van Nuys|US|M0
VOD|Vodochody Airport|Vodochody|CZ|M0
VOG|Volgograd International Airport|Volgograd|RU|L1
VOH|Vohemar Airport|Vohemar|MG|M0
VOI|Voinjama Airport|Voinjama|LR|S0
VOK|Volk Field|Camp Douglas|US|M0
VOL|Nea Anchialos National Airport|Nea Anchialos|GR|M1
VOT|Domingos Pignatari Airport|Votuporanga|BR|S0
VOZ|Voronezh International Airport|Voronezh|RU|M1
VPE|Ngjiva Pereira Airport|Ngiva|AO|M1
VPG|Vipingo Estate Airport|Kikambala|KE|S0
VPN|Vopnafjörður Airport|Vopnafjörður|IS|M1
VPS|Destin-Fort Walton Beach Airport|Valparaiso|US|M1
VPY|Chimoio Airport|Chimoio|MZ|M1
VPZ|Porter County Municipal Airport|Valparaiso|US|M0
VQQ|Cecil Airport|Jacksonville|US|M0
VQS|Antonio Rivera Rodriguez Airport|Vieques|PR|M1
VRA|Juan Gualberto Gomez International Airport|Matanzas|CU|L1
VRB|Vero Beach Regional Airport|Vero Beach|US|M1
VRC|Virac Airport|Virac|PH|M1
VRE|Vredendal Airport|Vredendal|ZA|M0
VRI|Varandey Airport|Varandey|RU|S0
VRK|Varkaus Airport|Varkaus / Joroinen|FI|M0
VRL|Vila Real Airport|Vila Real|PT|M1
VRN|Verona Villafranca Valerio Catullo Airport|Caselle (VR)|IT|L1
VRO|Kawama Airport|Santa Marta|CU|M0
VRS|Roy Otten Memorial Airfield|Versailles|US|S0
VRU|Vryburg Airport|Vryburg|ZA|M0
VRZ|Padre Israel Airport|Lavras|BR|S0
VSA|Carlos Rovirosa Pérez International Airport|Villahermosa|MX|L1
VSE|Aerodromo Goncalves Lobato (Viseu Airport)|Viseu|PT|M1
VSF|Hartness State Airport|North Springfield|US|S0
VST|Stockholm Västerås Airport|Stockholm / Västerås|SE|L1
VSV|Shravasti Airport|Shravasti|IN|S1
VTB|Vitebsk Vostochny Airport|Vitebsk|BY|M0
VTE|Wattay International Airport|Vientiane|LA|L1
VTF|Vatulele Airport|Vatulele|FJ|S0
VTG|Vung Tau Airport|Vũng Tàu|VN|S0
VTM|Nevatim Air Base|Beersheba|IL|M0
VTN|Miller Field|Valentine|US|M0
VTU|Hermanos Ameijeiras Airport|Las Tunas|CU|M1
VTZ|Alluri Sitarama Raju International Airport (Vizag)|Visakhapatnam|IN|L1
VUP|Alfonso López Pumarejo Airport|Valledupar|CO|M1
VUS|Velikiy Ustyug Airport|Velikiy Ustyug|RU|M1
VUU|Mvuu Camp Airport|Liwonde National Park|MW|S0
VVB|Mahanoro Airport|Mahanoro|MG|S0
VVC|Vanguardia Airport|Villavicencio|CO|M1
VVI|Viru Viru International Airport|Santa Cruz|BO|L1
VVK|Västervik Airport|Västervik|SE|S0
VVN|Las Malvinas/Echarate Airport|Las Malvinas|PE|S0
VVO|Vladivostok International Airport|Artyom|RU|L1
VVZ|Illizi Takhamalt Airport|Illizi|DZ|M1
VXC|Lichinga Airport|Lichinga|MZ|M1
VXE|Cesaria Evora International Airport|São Pedro|CV|L1
VXO|Växjö Kronoberg Airport|Växjö|SE|M1
VYD|Vryheid Airport|Vryheid|ZA|S0
VYI|Vilyuisk Airport|Vilyuisk|RU|M1
VYS|Illinois Valley Regional Airport Walter A Duncan Field|Peru|US|S0
WAA|Wales Airport|Wales|US|S1
WAD|Andriamena Airport|Andriamena|MG|S0
WAE|Wadi Al Dawasir Domestic Airport|Wadi Al Dawasir|SA|M1
WAF|Wana Airport|Waana|PK|S0
WAG|Wanganui Airport|Wanganui|NZ|M1
WAH|Harry Stern Airport|Wahpeton|US|S0
WAI|Ambalabe Airport|Antsohihy|MG|M0
WAJ|Wawoi Falls Airport|Wavoi Falls|PG|S0
WAK|Ankazoabo Airport|Ankazoabo|MG|S0
WAL|Wallops Flight Facility Airport|Wallops Island|US|S0
WAM|Ambatondrazaka Airport|Ambatondrazaka|MG|S0
WAO|Wabo Airport|Wabo|PG|S0
WAP|Alto Palena Airport|Palena|CL|S0
WAQ|Antsalova Airport|Antsalova|MG|S0
WAT|Waterford Airport|Waterford|IE|M0
WAU|Wauchope Airport|Wauchope|AU|S0
WAV|Wave Hill Airport||AU|S0
WAW|Warsaw Chopin Airport|Warsaw|PL|L1
WAX|Zuwarah International Airport|Zuwarah|LY|S0
WAY|Greene County Airport|Waynesburg|US|S0
WAZ|Warwick Airport||AU|S0
WBA|Wahai Airport|Wahai|ID|S0
WBB|Stebbins Airport|Stebbins|US|S1
WBC|Wapolu Airport|Wapolu|PG|S0
WBD|Avaratra Airport|Befandriana|MG|S0
WBE|Ankaizina Airport|Bealanana|MG|S0
WBG|Schleswig Air Base|Jagel|DE|M0
WBK|West Branch Community Airport|West Branch|US|S0
WBM|Wapenamanda Airport|Wapenamanda|PG|M1
WBO|Antsoa Airport|Beroroha|MG|S0
WBQ|Beaver Airport|Beaver|US|S1
WBR|Roben Hood Airport|Big Rapids|US|S0
WBU|Boulder Municipal Airport|Boulder|US|S0
WBW|Wilkes Barre Wyoming Valley Airport|Wilkes-Barre|US|S0
WCA|Gamboa Airport|Castro|CL|S0
WCD|Carosue Dam Airport|Cundeelee|AU|S0
WCH|Nuevo Chaitén Airport|Chaitén|CL|M0
WCR|Chandalar Lake Airport|Chandalar Lake|US|S0
WDA|Al Ain Airport Ain District, Shabwah Governorate, Yemen|Ain District|YE|S0
WDB|Weda Bay Airport|Weda|ID|S0
WDG|Enid Woodring Regional Airport|Enid|US|S0
WDH|Hosea Kutako International Airport|Windhoek|NA|L1
WDI|Wondai Airport||AU|S0
WDN|Waldron Airstrip|Eastsound|US|S1
WDR|Barrow County Airport|Winder|US|S0
WDS|Shiyan Wudangshan Airport|Shiyan (Maojian)|CN|M1
WEA|Parker County Airport|Weatherford|US|S0
WED|Wedau Airport|Wedau|PG|S0
WEF|Weifang Nanyuan Airport|Weifang (Kuiwen)|CN|M1
WEH|Weihai Dashuibo Airport|Weihai|CN|M1
WEI|Weipa Airport|Weipa|AU|M1
WEL|Welkom Airport|Welkom|ZA|S0
WEP|Weam Airport|Weam|PG|S0
WET|Deiyai / Waghete Baru Airport|Tigi|ID|S0
WEW|Wee Waa Airport||AU|S0
WFI|Fianarantsoa Airport|Fianarantsoa|MG|M0
WFK|Northern Aroostook Regional Airport|Frenchville|US|S0
WGA|Wagga Wagga Airport|Forest Hill|AU|M1
WGB|Bahawalnagar Airport|Bahawalnagar|PK|S0
WGC|Warangal Airport|Warangal|IN|S0
WGE|Walgett Airport||AU|M1
WGN|Shaoyang Wugang Airport|Shaoyang (Wugang)|CN|M1
WGO|Winchester Regional Airport|Winchester|US|S0
WGP|Umbu Mehang Kunda Airport|Waingapu-Sumba Island|ID|S1
WGT|Wangaratta Airport|Laceby|AU|M0
WHA|Wuhu Xuanzhou Airport|Wuhu|CN|M1
WHB|Eliwana||AU|M0
WHF|Wadi Halfa Airport|Wadi Halfa|SD|S0
WHK|Whakatāne Airport|Whakatāne|NZ|M1
WHL|Welshpool Airport|Welshpool|AU|S0
WHN|Wuhan Hannan Municipal Airport|Wuhan (Hannan)|CN|M0
WHO|Franz Josef Aerodrome||NZ|S0
WHP|Whiteman Airport|Pacoima|US|S0
WHS|Whalsay Airstrip|Whalsay, Shetlands|GB|S0
WHT|Wharton Regional Airport|Wharton|US|S0
WHU|Wuhu Wanli Airport / Wuhu Air Base|Wuhu|CN|S0
WIB|Wilbarger County Airport|Vernon|US|S0
WIC|Wick John O'Groats Airport|Wick|GB|M1
WIE|Wiesbaden Army Airfield|Wiesbaden|DE|M0
WIK|Waiheke Island Aerodrome|Waiheke Island|NZ|S0
WIL|Nairobi Wilson Airport|Nairobi|KE|M1
WIN|Winton Airport||AU|M1
WIO|Wilcannia Airport||AU|S0
WIR|Wairoa Airport|Wairoa|NZ|M0
WIU|Witu Airport|Garove Island|PG|S0
WJA|Woja Airport|Woja|MH|S0
WJF|General William J Fox Airfield|Lancaster|US|M0
WJR|Wajir Airport|Wajir|KE|M1
WJU|Wonju Airport / Hoengseong Air Base (K-38/K-46)|Wonju|KR|M1
WKA|Wanaka Airport|Wanaka|NZ|M1
WKB|Warracknabeal Airport||AU|M0
WKF|Waterkloof Air Force Base|Pretoria|ZA|M0
WKI|Hwange (Town) Airport|Hwange|ZW|S0
WKJ|Wakkanai Airport|Wakkanai|JP|M1
WKK|Aleknagik / New Airport|Aleknagik|US|M1
WKN|Wakunai Airport|Wakunai|PG|S0
WKR|Walkers Cay Airport|Walkers Cay|BS|S0
WLA|Wallal Downs Airport|Eighty Mile Beach|AU|S0
WLC|Walcha Airport||AU|S0
WLD|Strother Field|Winfield / Arkansas City|US|S0
WLE|Miles Airport||AU|S0
WLG|Wellington International Airport|Wellington|NZ|L1
WLH|Walaha Airport|Walaha|VU|S1
WLK|Selawik Airport|Selawik|US|S1
WLL|Wollogorang Airport||AU|S0
WLO|Waterloo Airport||AU|S0
WLP|West Angelas Airport||AU|S0
WLS|Hihifo Airport|Wallis Island|WF|L1
WLU|Walluanda Airport|Puri|PG|S0
WLW|Willows Glenn County Airport|Willows|US|S0
WMA|Mandritsara Airport|Mandritsara|MG|S0
WMB|Warrnambool Airport||AU|S0
WMC|Winnemucca Municipal Airport|Winnemucca|US|M0
WMD|Mandabe Airport|Mandabe|MG|S0
WME|Mount Keith Airport||AU|M0
WMH|Ozark Regional Airport|Mountain Home|US|M0
WMI|Warsaw Modlin Airport|Nowy Dwór Mazowiecki|PL|L1
WML|Malaimbandy Airport|Malaimbandy|MG|S0
WMN|Maroantsetra Airport|Maroantsetra|MG|M1
WMO|White Mountain Airport|White Mountain|US|S1
WMP|Mampikony Airport|Mampikony|MG|S0
WMR|Mananara Nord Airport|Mananara Nord|MG|M0
WMT|Zunyi Maotai Airport|Zunyi|CN|M1
WMX|Wamena Airport|Wamena|ID|M1
WNA|Napakiak Airport|Napakiak|US|S1
WND|Windarra Airport|Laverton|AU|S0
WNH|Wenshan Puzhehei Airport|Wenshan|CN|S1
WNI|Matahora Airport|Wangi-wangi Island|ID|M1
WNN|Wunnumin Lake Airport|Wunnumin Lake|CA|S1
WNP|Naga Airport|Naga|PH|M1
WNR|Windorah Airport|Windorah|AU|M1
WNS|Shaheed Benazirabad Airport|Nawabashah|PK|M1
WNU|Wanuma Airport|Wanuma|PG|S0
WNZ|Wenzhou Longwan International Airport|Wenzhou (Longwan)|CN|L1
WOA|Wonenara Airport|Wonenara|PG|S0
WOE|Woensdrecht Air Base|Hoogerheide|NL|M0
WOK|Uon Quen Airport|Uonquén|VE|S0
WOL|Shellharbour Airport|Albion Park Rail|AU|M0
WON|Wondoola Airport|Wondoola|AU|S0
WOS|Wonsan Kalma Airport|Wonsan|KP|M1
WOT|Wang'an Airport|Wang'an|TW|S0
WOW|Willow Airport|Willow|US|S0
WPA|Cabo Juan Román Airfield|Puerto Aysén|CL|S0
WPB|Port Bergé Airport|Port Bergé|MG|S0
WPC|Pincher Creek Airport|Pincher Creek|CA|M0
WPK|Wrotham Park Airport|Wrotham Park|AU|S0
WPM|Wipim Airport|Wipim|PG|S0
WPO|North Fork Valley Airport|Paonia|US|S0
WPR|Captain Fuentes Martinez Airport|Porvenir|CL|M0
WPU|Guardia Marina Zañartu Airport|Puerto Williams|CL|M0
WRA|Warder Airport|Warder|ET|S0
WRB|Robins Air Force Base|Warner Robins|US|M0
WRE|Whangarei Airport|Whangarei|NZ|M1
WRG|Wrangell Airport|Wrangell|US|M1
WRH|Wuerhe Airport|Orku|CN|S0
WRI|Mc Guire Air Force Base|Wrightstown|US|M0
WRL|Worland Municipal Airport|Worland|US|M0
WRN|Windarling Airport|Windarling Mine|AU|S0
WRO|Copernicus Wrocław Airport|Wrocław|PL|L1
WRT|Warton Aerodrome|Warton|GB|M0
WRW|Warrawagine Airport||AU|S0
WRY|Westray Airport|Westray, Orkney Islands|GB|S1
WRZ|Weerawila Airport|Weerawila|LK|S0
WSA|Wasua Airport|Wasua|PG|S0
WSF|Cape Sarichef Airport|Cape Sarichef|US|S0
WSG|Washington County Airport|Washington|US|S0
WSH|Brookhaven Calabro Airport|Shirley|US|S0
WSI|Western Sydney International (Nancy-Bird Walton) Airport|Sydney|AU|L0
WSK|Chongqing Wushan Airport|Wushan|CN|S1
WSM|Wiseman Airport|Wiseman|US|S0
WSN|South Naknek Number 2 Airport|South Naknek|US|S1
WSO|Washabo Airport|Washabo|SR|S0
WSP|Waspam Airport|Waspam|NI|S0
WSR|Wasior Airport|Wasior|ID|S0
WST|Westerly State Airport|Westerly|US|M1
WSU|Wasu Airport|Wasu|PG|S0
WSY|Shute Harbour/Whitsunday Airport|Shute Harbour|AU|S0
WSZ|Westport Airport|Westport|NZ|M1
WTA|Tambohorano Airport|Tambohorano|MG|S1
WTB|Toowoomba Wellcamp Airport|Toowoomba|AU|L1
WTD|West End Airport|West End|BS|S0
WTE|Wotje Airport|Wotje|MH|S1
WTK|Noatak Airport|Noatak|US|S1
WTL|Tuntutuliak Airport|Tuntutuliak|US|S1
WTN|RAF Waddington|Lincoln, Lincolnshire|GB|M0
WTO|Wotho Island Airport|Wotho Island|MH|S1
WTP|Woitape Airport|Fatima Mission|PG|S0
WTR|Whiteriver Airport|Whiteriver|US|S0
WTS|Tsiroanomandidy Airport|Tsiroanomandidy|MG|S0
WTT|Wantoat Airport|Wantoat|PG|S0
WTZ|Whitianga Airport|Whitianga|NZ|S0
WUA|Wuhai Airport|Wuhai|CN|M1
WUD|Wudinna Airport||AU|S0
WUG|Wau Airport|Wau|PG|S0
WUH|Wuhan Tianhe International Airport|Wuhan (Huangpi)|CN|L1
WUI|Murrin Murrin Airport|Murrin Murrin|AU|S0
WUM|Wasum Airport|Wasum|PG|S0
WUN|Wiluna Airport||AU|M1
WUS|Nanping Wuyishan Airport|Wuyishan|CN|M1
WUT|Xinzhou Wutaishan Airport|Xinzhou|CN|S1
WUU|Wau Airport|Wau|SS|M1
WUV|Wuvulu Island Airport|Wuvulu Island|PG|S0
WUX|Sunan Shuofang International Airport|Wuxi|CN|L1
WUZ|Wuzhou Xijiang Airport|Tangbu|CN|M1
WVB|Walvis Bay International Airport|Walvis Bay(Rooikop)|NA|L1
WVI|Watsonville Municipal Airport|Watsonville|US|S0
WVK|Manakara Airport|Manakara|MG|M0
WVL|Waterville Robert Lafleur Airport|Waterville|US|S0
WVN|JadeWeser Airport|Wilhelmshaven|DE|S0
WWA|Wasilla Airport|Wasilla|US|M0
WWD|Cape May County Airport|Wildwood|US|M0
WWI|Woodie Woodie Airport|Woodie Woodie|AU|S0
WWK|Wewak International Airport|Wewak|PG|M1
WWR|West Woodward Airport|Woodward|US|M0
WWT|Mertarvik Airport|Mertarvik|US|S1
WWY|West Wyalong Airport|West Wyalong|AU|M0
WXN|Wanzhou Wuqiao Airport|Wanzhou|CN|S1
WYA|Whyalla Airport|Whyalla|AU|M1
WYE|Yengema Airport|Yengema|SL|M0
WYN|Wyndham Airport||AU|S0
WYS|Yellowstone Airport|West Yellowstone|US|M1
WZA|Wa Airport|Wa|GH|S0
WZQ|Urad Middle Banner Airport|Urad Middle Banner|CN|S0
XAI|Xinyang Minggang Airport|Xinyang|CN|M1
XAL|Álamos Airport|Álamos|MX|S0
XAP|Serafin Enoss Bertaso Airport|Chapecó|BR|M1
XAR|Aribinda Airport|Aribinda|BF|S0
XAU|Saül Airport|Saül|GF|S0
XBE|Bearskin Lake Airport|Bearskin Lake|CA|S1
XBG|Bogande Airport|Bogande|BF|S0
XBJ|Birjand International Airport|Birjand|IR|L1
XBN|Biniguni Airport|Biniguni|PG|S0
XBO|Boulsa Airport|Boulsa|BF|S0
XBR|Brockville - Thousand Islands Regional Tackaberry Airport|Brockville|CA|S0
XCH|Christmas Island International Airport|Flying Fish Cove|CX|M1
XCL|Cluff Lake Airport|Cluff Lake|CA|S0
XCM|Chatham Kent Airport|Chatham-Kent|CA|S0
XCO|Colac Airport|Colac Otway Shire|AU|S0
XCR|Chalons Vatry airport|Chalons en Champagne|FR|M1
XDE|Diebougou Airport|Diebougou|BF|S0
XDJ|Djibo Airport|Djibo|BF|S0
XEN|Xingcheng Air Base|Huludao (Xingcheng)|CN|M0
XES|Grand Geneva Resort Airport|Lake Geneva|US|S0
XFN|Xiangyang Liuji Airport|Xiangyang (Xiangzhou)|CN|M1
XFT|Big Pine Sands STOLGround|Big Pine Key, Florida|US|S0
XFW|Hamburg-Finkenwerder Airport|Hamburg|DE|M0
XGA|Gaoua Airport|Gaoua|BF|S0
XGG|Gorom-Gorom Airport|Gorom-Gorom|BF|S0
XGN|Xangongo Airport|Xangongo|AO|M0
XGR|Kangiqsualujjuaq (Georges River) Airport|Kangiqsualujjuaq|CA|S1
XIC|Xichang Qingshan Airport|Liangshan (Xichang)|CN|M1
XIE|Xienglom Airport|Xienglom|LA|S0
XIG|Xinguara Municipal Airport|Xinguara|BR|S0
XIJ|Ahmed Al Jaber Air Base|Ahmed Al Jaber AB|KW|M0
XIL|Xilinhot Airport|Xilinhot|CN|M1
XIN|Xingning Air Base|Meizhou (Xingning)|CN|S0
XIY|Xi'an Xianyang International Airport|Xi'an|CN|L1
XJD|Al Udeid Air Base|Ar Rayyan|QA|M0
XJM|Mangla Airport|Mangla|PK|M0
XKA|Kantchari Airport|Kantchari|BF|S0
XKH|Xieng Khouang Airport|Xieng Khouang|LA|S1
XKS|Kasabonika Airport|Kasabonika|CA|M1
XKY|Kaya Airport|Kaya|BF|S0
XLB|Lac Brochet Airport|Lac Brochet|CA|S1
XLS|Saint Louis Airport|Saint Louis|SN|M0
XLU|Leo Airport|Leo|BF|S0
XMA|Maramag Airport|Maramag|PH|S0
XMC|Mallacoota Airport||AU|S0
XMD|Madison Municipal Airport|Madison|US|S0
XMG|Mahendranagar Airport|Mahendranagar|NP|S0
XMH|Manihi Airport||PF|M1
XMI|Masasi Airport|Masasi|TZ|S0
XML|Minlaton Airport||AU|S0
XMN|Xiamen Gaoqi International Airport|Xiamen|CN|L1
XMP|Macmillan Pass Airport|Macmillan Pass|CA|S0
XMS|Coronel E Carvajal Airport|Macas|EC|M1
XMY|Yam Island Airport|Yam Island|AU|S1
XNA|Northwest Arkansas National Airport|Fayetteville/Springdale/Rogers|US|M1
XNH|Ali Air Base|Nasiriyah|IQ|M0
XNN|Xining Caojiabao International Airport|Haidong (Huzhu Tu Autonomous County)|CN|L1
XNT|Xingtai Dalian Airport|Xingtai|CN|S0
XNU|Nouna Airport|Nouna|BF|S0
XPA|Pama Airport|Pama|BF|S0
XPK|Pukatawagan Airport|Pukatawagan|CA|S1
XPL|Palmerola International Airport|Palmerola|HN|L1
XPP|Poplar River Airport|Poplar River|CA|S0
XPR|Pine Ridge Airport|Pine Ridge|US|S0
XQP|Quepos Managua Airport|Quepos|CR|M1
XQU|Qualicum Beach Airport|Qualicum Beach|CA|M1
XRH|RAAF Base Richmond|Richmond|AU|M0
XRQ|New Barag Right Banner Baogede Airport|New Barag Right Banner|CN|S0
XRR|Ross River Airport|Ross River|CA|M0
XRY|Jerez Airport|Jerez de la Frontera|ES|M1
XSB|Sir Bani Yas Airport|Sir Bani Yas|AE|M0
XSC|South Caicos Airport|South Caicos|TC|M1
XSD|Tonopah Test Range Airport|Tonopah|US|S0
XSE|Sebba Airport|Sebba|BF|S0
XSI|South Indian Lake Airport|South Indian Lake|CA|S1
XSO|Siocon Airport|Siocon|PH|S0
XSP|Seletar Airport|Seletar|SG|M1
XTG|Thargomindah Airport|Thargomindah|AU|M1
XTL|Tadoule Lake Airport|Tadoule Lake|CA|S1
XTO|Taroom Airport||AU|S0
XTR|Tara Airport||AU|S0
XUZ|Xuzhou Guanyin International Airport|Xuzhou|CN|M1
XWA|Williston Basin International Airport|Williston|US|M1
XYA|Yandina Airport|Yandina|SB|S1
XYE|Ye Airport|Ye|MM|S0
XYR|Edwaki Airport|Yellow River Mission|PG|S0
XZA|Zabré Airport|Zabré|BF|S0
YAA|Anahim Lake Airport|Anahim Lake|CA|M1
YAB|Arctic Bay Airport|Arctic Bay|CA|S1
YAC|Cat Lake Airport|Cat Lake|CA|S1
YAE|Yartsevo Airport|Yartsevo|RU|S0
YAG|Fort Frances Municipal Airport|Fort Frances|CA|M1
YAH|La Grande-4 Airport|La Grande-4|CA|M0
YAI|Gral. Bernardo O´Higgins Airport|Chillan|CL|M0
YAK|Yakutat Airport|Yakutat|US|M1
YAL|Alert Bay Airport|Alert Bay|CA|S1
YAM|Sault Ste Marie Airport|Sault Ste Marie|CA|M1
YAN|Yangambi Airport|Yangambi|CD|S0
YAO|Yaoundé Ville Airport|Yaoundé|CM|M0
YAP|Yap International Airport|Yap Island|FM|L1
YAR|La Grande-3 Airport|La Grande-3|CA|S0
YAS|Yasawa Island Airport|Yasawa Island|FJ|S1
YAT|Attawapiskat Airport|Attawapiskat|CA|S1
YAU|Donaldson Airport|Kattiniq|CA|S0
YAX|Wapekeka Airport|Angling Lake|CA|S1
YAY|St. Anthony Airport|St. Anthony|CA|M1
YAZ|Tofino / Long Beach Airport|Tofino|CA|M1
YBA|Banff Airport|Banff|CA|S0
YBB|Kugaaruk Airport|Kugaaruk|CA|S1
YBC|Baie-Comeau Airport|Baie-Comeau|CA|M1
YBE|Uranium City Airport|Uranium City|CA|S1
YBG|Saguenay-Bagotville Airport|Saguenay|CA|M1
YBI|Black Tickle Airport|Black Tickle|CA|S1
YBK|Baker Lake Airport|Baker Lake|CA|M1
YBL|Campbell River Airport|Campbell River|CA|M1
YBO|Bob Quinn Lake Airport|Bob Quinn Lake|CA|S0
YBP|Yibin Wuliangye Airport|Yibin (Cuiping)|CN|M1
YBR|Brandon Municipal Airport|Brandon|CA|M1
YBS|Opapimiskan Lake Airport|Opapimiskan Lake|CA|S0
YBT|Brochet Airport|Brochet|CA|S1
YBV|Berens River Airport|Berens River|CA|S1
YBX|Lourdes-de-Blanc-Sablon Airport|Blanc-Sablon|CA|M1
YBY|Bonnyville Airport|Bonnyville|CA|M1
YCA|Courtenay Airpark|Courtenay|CA|S0
YCB|Cambridge Bay Airport|Cambridge Bay|CA|M1
YCC|Cornwall Regional Airport|Cornwall|CA|M0
YCD|Nanaimo Airport|Nanaimo|CA|M1
YCE|Centralia / James T. Field Memorial Aerodrome|Huron Park|CA|M0
YCG|Castlegar/West Kootenay Regional Airport|Castlegar|CA|M1
YCH|Miramichi Airport|Miramichi|CA|M0
YCK|Tommy Kochon Airport|Colville Lake|CA|S1
YCL|Charlo Airport|Charlo|CA|M0
YCM|Niagara District Airport|Niagara-on-the-Lake|CA|M1
YCN|Cochrane Airport|Cochrane|CA|M0
YCO|Kugluktuk Airport|Kugluktuk|CA|S1
YCQ|Chetwynd Airport|Chetwynd|CA|M0
YCR|Cross Lake (Charlie Sinclair Memorial) Airport|Cross Lake|CA|S1
YCS|Chesterfield Inlet Airport|Chesterfield Inlet|CA|S1
YCT|Coronation Airport|Coronation|CA|S0
YCU|Yuncheng Yanhu International Airport|Yuncheng (Yanhu)|CN|L1
YCW|Chilliwack Airport|Chilliwack|CA|S0
YCY|Clyde River Airport|Clyde River|CA|S1
YCZ|Fairmont Hot Springs Airport|Fairmont Hot Springs|CA|S0
YDA|Dawson City Airport|Dawson City|CA|M1
YDB|Burwash Airport|Burwash Landing|CA|M0
YDC|Drayton Valley Industrial Airport|Drayton Valley|CA|S0
YDF|Deer Lake Airport|Deer Lake|CA|M1
YDG|Digby / Annapolis Regional Airport|Digby|CA|M0
YDJ|Hatchet Lake Airport|Hatchet Lake|CA|S0
YDL|Dease Lake Airport|Dease Lake|CA|S1
YDN|Dauphin Barker Airport|Dauphin|CA|M1
YDO|Dolbeau-Saint-Felicien Airport|Dolbeau-Saint-Felicien|CA|M0
YDP|Nain Airport|Nain|CA|S1
YDQ|Dawson Creek Airport|Dawson Creek|CA|M0
YDT|Boundary Bay Airport|Delta|CA|M0
YDU|Kasba Lake Airport|Kasba Lake|CA|S0
YDV|Bloodvein River Airport|Bloodvein River|CA|S1
YDW|North of Sixty Airport|Obre Lake|CA|S0
YEB|Bar River Airport|Echo Bay|CA|S0
YEC|Yecheon Airbase|Yecheon-ri|KR|M0
YEG|Edmonton International Airport|Edmonton|CA|L1
YEH|Yinchuan Yueyahu Airport|Yinchuan|CN|S0
YEI|Bursa Yenişehir Airport|Yenişehir|TR|M1
YEK|Arviat Airport|Arviat|CA|S1
YEL|Elliot Lake Municipal Airport|Elliot Lake|CA|M0
YEM|Manitoulin East Municipal Airport|Sheguiandah|CA|M0
YEN|Estevan Airport|Estevan|CA|M0
YEO|RNAS Yeovilton|Yeovil, Somerset|GB|M0
YEQ|Yenkis(Yankisa) Airport||PG|S0
YER|Fort Severn Airport|Fort Severn|CA|S1
YES|Yasuj Airport|Yasuj|IR|M0
YET|Edson Airport|Edson|CA|M0
YEU|Eureka Airport|Eureka|CA|S0
YEV|Inuvik Mike Zubko Airport|Inuvik|CA|M1
YEY|Amos/Magny Airport|Amos|CA|M0
YFA|Fort Albany Airport|Fort Albany|CA|S1
YFB|Iqaluit Airport|Iqaluit|CA|M1
YFC|Fredericton International Airport|Fredericton|CA|M1
YFE|Forestville Airport|Forestville|CA|M0
YFG|Fontanges Airport|Fontanges|CA|S0
YFH|Fort Hope Airport|Fort Hope|CA|S1
YFI|Fort Mackay / Firebag|Suncor Energy Site|CA|S0
YFJ|Wekweètì Airport|Wekweètì|CA|S1
YFO|Flin Flon Airport|Flin Flon|CA|S1
YFR|Fort Resolution Airport|Fort Resolution|CA|M0
YFS|Fort Simpson Airport|Fort Simpson|CA|M1
YFX|St. Lewis (Fox Harbour) Airport|St. Lewis|CA|S1
YGA|Yongchuan Da'an General Airport|Chongqing|CN|S0
YGB|Texada Gillies Bay Airport|Texada|CA|S0
YGH|Fort Good Hope Airport|Fort Good Hope|CA|S1
YGJ|Yonago Kitaro Airport / JASDF Miho Air Base|Yonago|JP|M1
YGK|Kingston Norman Rogers Airport|Kingston|CA|M0
YGL|La Grande Rivière Airport|La Grande Rivière|CA|M1
YGM|Gimli Industrial Park Airport|Gimli|CA|M0
YGO|Gods Lake Narrows Airport|Gods Lake Narrows|CA|S1
YGP|Michel-Pouliot Gaspé Airport|Gaspé|CA|M1
YGQ|Geraldton Greenstone Regional Airport|Geraldton|CA|M0
YGR|Îles-de-la-Madeleine Airport|Les Îles-de-la-Madeleine|CA|M1
YGT|Igloolik Airport|Igloolik|CA|S1
YGV|Havre-Saint-Pierre Airport|Havre-Saint-Pierre|CA|M1
YGW|Kuujjuarapik Airport|Kuujjuarapik|CA|M1
YGX|Gillam Airport|Gillam|CA|S1
YGZ|Grise Fiord Airport|Grise Fiord|CA|S1
YHA|Port Hope Simpson Airport|Port Hope Simpson|CA|S1
YHB|Hudson Bay Airport|Hudson Bay|CA|S0
YHD|Dryden Regional Airport|Dryden|CA|M0
YHE|Hope Airport / FVRD Regional Airpark|Hope|CA|S0
YHF|Hearst René Fontaine Municipal Airport|Hearst|CA|M0
YHG|Charlottetown Airport|Charlottetown|CA|S1
YHI|Ulukhaktok Holman Airport|Ulukhaktok|CA|S1
YHJ|Nanchang Yaohu Airport|Nanchang|CN|S0
YHK|Gjoa Haven Airport|Gjoa Haven|CA|S1
YHM|John C. Munro Hamilton International Airport|Hamilton|CA|L1
YHN|Hornepayne Municipal Airport|Hornepayne|CA|M0
YHO|Hopedale Airport|Hopedale|CA|S1
YHP|Poplar Hill Airport|Poplar Hill|CA|S1
YHR|Chevery Airport|Chevery|CA|S1
YHS|Sechelt-Gibsons Airport|Sechelt|CA|S0
YHT|Haines Junction Airport|Haines Junction|CA|M0
YHU|Montréal / Saint-Hubert Metropolitan Airport|Montréal|CA|M1
YHY|Hay River / Merlyn Carter Airport|Hay River|CA|M1
YHZ|Halifax / Stanfield International Airport|Halifax|CA|L1
YIA|Yogyakarta International Airport|Yogyakarta|ID|L1
YIB|Atikokan Municipal Airport|Atikokan|CA|M0
YIC|Yichun Mingyueshan Airport|Yichun|CN|M1
YIE|Arxan Yi'ershi Airport|Arxan|CN|M1
YIF|St Augustin Airport|St-Augustin|CA|M1
YIH|Yichang Sanxia Airport|Yichang (Xiaoting)|CN|M1
YIK|Ivujivik Airport|Ivujivik|CA|S1
YIN|Ili Yining International Airport|Ili (Yining / Ghulja)|CN|M1
YIO|Pond Inlet Airport|Pond Inlet|CA|S1
YIP|Willow Run Airport|Detroit|US|M0
YIV|Island Lake Airport|Island Lake|CA|M1
YIW|Yiwu Airport|Yiwu/Jinhua|CN|L1
YJA|Jasper Airport|Jasper|CA|S0
YJF|Fort Liard Airport|Fort Liard|CA|M0
YJN|St Jean Airport|St Jean|CA|M0
YJP|Jasper-Hinton Airport|Hinton|CA|S0
YJS|Samjiyŏn Airport|Samjiyŏn|KP|S0
YKA|Kamloops John Moose Fulton Field Regional Airport|Kamloops|CA|M1
YKC|Collins Bay Airport|Collins Bay|CA|S0
YKD|Kincardine Municipal Airport|Kincardine|CA|M0
YKE|Knee Lake Airport|Knee Lake|CA|S0
YKF|Region of Waterloo International Airport|Breslau|CA|M1
YKG|Kangirsuk Airport|Kangirsuk|CA|S1
YKH|Yingkou Lanqi Airport|Yingkou (Laobian)|CN|M1
YKJ|Key Lake Airport|Key Lake|CA|M0
YKL|Schefferville Airport|Schefferville|CA|M1
YKM|Yakima Air Terminal McAllister Field|Yakima|US|M1
YKN|Chan Gurney Municipal Airport|Yankton|US|M0
YKO|Hakkari Yüksekova Airport|Hakkari|TR|M1
YKQ|Waskaganish Airport|Waskaganish|CA|S1
YKS|Platon Oyunsky Yakutsk International Airport|Yakutsk|RU|L1
YKU|Chisasibi Airport|Chisasibi|CA|S1
YKX|Kirkland Lake Airport|Kirkland Lake|CA|M0
YKY|Kindersley Airport|Kindersley|CA|M0
YLB|Lac La Biche Airport|Lac La Biche|CA|S0
YLC|Kimmirut Airport|Kimmirut|CA|S1
YLD|Chapleau Airport|Chapleau|CA|M0
YLE|Whatì Airport|Whatì|CA|S1
YLG|Yalgoo Airport|Yalgoo|AU|S0
YLH|Lansdowne House Airport|Lansdowne House|CA|S1
YLI|Ylivieska Airfield|Ylivieska|FI|M0
YLJ|Meadow Lake Airport|Meadow Lake|CA|M0
YLK|Barrie-Lake Simcoe Regional Airport|Barrie|CA|M1
YLL|Lloydminster Airport|Lloydminster|CA|M1
YLP|Mingan Airport|Longue-Pointe-de-Mingan|CA|S0
YLQ|La Tuque Airport|La Tuque|CA|S0
YLR|Leaf Rapids Airport|Leaf Rapids|CA|M0
YLS|Lebel-sur-Quevillon Airport|Lebel-sur-Quévillon|CA|S0
YLT|Alert Airport|Alert|CA|M0
YLV|Yevlakh Airport|Yevlakh|AZ|S0
YLW|Kelowna International Airport|Kelowna|CA|L1
YLX|Yulin Fumian Airport|Yulin|CN|M1
YLY|Langley Airport|Langley|CA|M0
YMA|Mayo Airport|Mayo|CA|M0
YMB|Merritt Airport|Merritt|CA|S0
YME|Matane Airport|Matane|CA|M0
YMG|Manitouwadge Airport|Manitouwadge|CA|M0
YMH|Mary's Harbour Airport|Mary's Harbour|CA|S1
YMJ|Moose Jaw Air Vice Marshal C. M. McEwen Airport|Moose Jaw|CA|M0
YMK|Mys Kamenny Airport|Mys Kamennyi|RU|S0
YML|Charlevoix Airport|Charlevoix|CA|M0
YMM|Fort McMurray International Airport|Fort McMurray|CA|M1
YMN|Makkovik Airport|Makkovik|CA|S1
YMO|Moosonee Airport|Moosonee|CA|M1
YMP|Port McNeill Airport|Port McNeill|CA|S1
YMS|Moises Benzaquen Rengifo Airport|Yurimaguas|PE|M1
YMT|Chapais Airport|Chibougamau|CA|M1
YMV|Mary River Aerodrome|Mary River|CA|S0
YMW|Maniwaki Airport|Messines|CA|S0
YMX|Montreal Mirabel International Airport|Montréal|CA|M1
YNA|Natashquan Airport|Natashquan|CA|M1
YNB|Prince Abdulmohsen Bin Abdulaziz International Airport|Yanbu|SA|L1
YNC|Wemindji Airport|Wemindji|CA|S1
YND|Ottawa / Gatineau Airport|Gatineau|CA|M1
YNE|Norway House Airport|Norway House|CA|S1
YNG|Youngstown Warren Regional Airport|Youngstown/Warren|US|M0
YNH|Hudson's Hope Airport|Hudson's Hope|CA|S0
YNJ|Yanji Chaoyangchuan Airport|Yanji|CN|M1
YNL|Points North Landing Airport|Points North Landing|CA|M1
YNM|Matagami Airport|Matagami|CA|M0
YNO|North Spirit Lake Airport|North Spirit Lake|CA|S1
YNP|Natuashish Airport|Natuashish|CA|S1
YNS|Nemiscau Airport|Nemiscau|CA|S1
YNT|Yantai Penglai International Airport|Yantai|CN|L1
YNX|Snap Lake Airport|Snap Lake Mine|CA|S0
YNY|Yangyang International Airport|Gonghang-ro|KR|L1
YNZ|Yancheng Nanyang International Airport|Yancheng (Tinghu)|CN|L1
YOA|Ekati Airport|Ekati|CA|M0
YOC|Old Crow Airport|Old Crow|CA|S1
YOD|CFB Cold Lake|Cold Lake|CA|M0
YOE|Donnelly Airport|Donnelly|CA|S0
YOG|Ogoki Post Airport|Ogoki Post|CA|S1
YOH|Oxford House Airport|Oxford House|CA|S1
YOI|Opinaca Aerodrome|Éléonore Mine|CA|S0
YOJ|High Level Airport|High Level|CA|M1
YOL|Yola Airport|Yola|NG|M1
YON|Yongphulla Airport|Yongphulla|BT|S1
YOO|Oshawa Executive Airport|Oshawa|CA|M0
YOP|Rainbow Lake Airport|Rainbow Lake|CA|M0
YOS|Owen Sound / Billy Bishop Regional Airport|Owen Sound|CA|M0
YOW|Ottawa Macdonald-Cartier International Airport|Ottawa|CA|L1
YPA|Prince Albert Glass Field|Prince Albert|CA|M1
YPB|Alberni Valley Regional Airport|Port Alberni|CA|S0
YPC|Paulatuk (Nora Aliqatchialuk Ruben) Airport|Paulatuk|CA|S1
YPD|Parry Sound Area Municipal Airport|Parry Sound|CA|S0
YPE|Peace River Airport|Peace River|CA|M1
YPG|Portage-la-Prairie / Southport Airport|Portage la Prairie|CA|M0
YPH|Inukjuak Airport|Inukjuak|CA|S1
YPJ|Aupaluk Airport|Aupaluk|CA|S1
YPL|Pickle Lake Airport|Pickle Lake|CA|M1
YPM|Pikangikum Airport|Pikangikum|CA|S1
YPN|Port-Menier Airport|Port-Menier|CA|M1
YPO|Peawanuck Airport|Peawanuck|CA|S1
YPQ|Peterborough Regional Airport|Peterborough|CA|M1
YPR|Prince Rupert Airport|Prince Rupert|CA|M1
YPS|Port Hawkesbury Airport|Port Hawkesbury|CA|M0
YPW|Powell River Airport|Powell River|CA|M1
YPX|Puvirnituq Airport|Puvirnituq|CA|M1
YPY|Fort Chipewyan Airport|Fort Chipewyan|CA|M1
YPZ|Burns Lake Airport|Burns Lake|CA|M1
YQA|Muskoka Airport|Gravenhurst|CA|M1
YQB|Quebec Jean Lesage International Airport|Quebec|CA|L1
YQC|Quaqtaq Airport|Quaqtaq|CA|S1
YQD|The Pas Airport|The Pas|CA|M1
YQF|Red Deer Regional Airport|Springbrook|CA|M0
YQG|Windsor International Airport|Windsor|CA|L1
YQH|Watson Lake Airport|Watson Lake|CA|M1
YQI|Yarmouth Airport|Yarmouth|CA|M0
YQK|Kenora Airport|Kenora|CA|M1
YQL|Lethbridge County Airport|Lethbridge|CA|M1
YQM|Greater Moncton Roméo LeBlanc International Airport|Moncton|CA|M1
YQN|Nakina Airport|Nakina|CA|M1
YQQ|Comox Valley International Airport / CFB Comox|Comox|CA|M1
YQR|Regina International Airport|Regina|CA|M1
YQS|St Thomas Municipal Airport|St Thomas|CA|M0
YQT|Thunder Bay International Airport|Thunder Bay|CA|M1
YQU|Grande Prairie Airport|Grande Prairie|CA|M1
YQV|Yorkton Municipal Airport|Yorkton|CA|M0
YQW|North Battleford Airport|North Battleford|CA|M0
YQX|Gander International Airport|Gander|CA|M1
YQY|Sydney / J.A. Douglas McCurdy Airport|Sydney|CA|M1
YQZ|Quesnel Airport|Quesnel|CA|M1
YRA|Rae Lakes Airport|Gamètì|CA|S1
YRB|Resolute Bay Airport|Resolute Bay|CA|M1
YRD|Dean River Airport|Kimsquit Valley|CA|S0
YRF|Cartwright Airport|Cartwright|CA|S1
YRG|Rigolet Airport|Rigolet|CA|S1
YRI|Rivière-du-Loup Airport|Rivière-du-Loup|CA|M0
YRJ|Roberval Airport|Roberval|CA|M1
YRL|Red Lake Airport|Red Lake|CA|M1
YRM|Rocky Mountain House Airport|Rocky Mountain House|CA|S0
YRO|Ottawa / Rockcliffe Airport|Ottawa|CA|M1
YRQ|Trois-Rivières Airport|Trois-Rivières|CA|M0
YRR|Stuart Island Airstrip|Big Bay|CA|S0
YRS|Red Sucker Lake Airport|Red Sucker Lake|CA|S1
YRT|Rankin Inlet Airport|Rankin Inlet|CA|M1
YRV|Revelstoke Airport|Revelstoke|CA|M0
YSA|Sable Island Airport.|Sable Island|CA|S0
YSB|Sudbury Airport|Sudbury|CA|M1
YSC|Sherbrooke Airport|Sherbrooke|CA|M0
YSE|Squamish Airport|Squamish|CA|S0
YSF|Stony Rapids Airport|Stony Rapids|CA|M1
YSG|Lutselk'e Airport|Lutselk'e|CA|S1
YSH|Smiths Falls-Montague (Russ Beach) Airport|Smiths Falls|CA|M0
YSJ|Saint John Airport|Saint John|CA|M1
YSK|Sanikiluaq Airport|Sanikiluaq|CA|S1
YSL|Saint-Léonard Airport|Saint-Léonard|CA|M0
YSM|Fort Smith Airport|Fort Smith|CA|M1
YSN|Shuswap Regional Airport|Salmon Arm|CA|M0
YSO|Postville Airport|Postville|CA|S1
YSP|Marathon Airport|Marathon|CA|M0
YSQ|Songyuan Chaganhu Airport|Qian Gorlos Mongol Autonomous County|CN|M1
YST|St. Theresa Point Airport|St. Theresa Point|CA|S1
YSU|Summerside Airport|Slemon Park|CA|M0
YSV|Saglek Airport|Saglek|CA|S0
YSY|Sachs Harbour (David Nasogaluak Jr. Saaryuaq) Airport|Sachs Harbour|CA|S1
YTA|Pembroke Airport|Pembroke|CA|M0
YTD|Thicket Portage Airport|Thicket Portage|CA|M0
YTE|Cape Dorset Airport|Kinngait|CA|S1
YTF|Alma Airport|Alma|CA|M0
YTH|Thompson Airport|Thompson|CA|M1
YTL|Big Trout Lake Airport|Big Trout Lake|CA|S1
YTM|Mont-Tremblant International Airport|La Macaza|CA|M0
YTQ|Tasiujaq Airport|Tasiujaq|CA|S1
YTR|CFB Trenton|Trenton|CA|M0
YTS|Timmins/Victor M. Power|Timmins|CA|M1
YTT|Tisdale Airport|Tisdale|CA|S0
YTW|Yutian Wanfang Airport|Hotan (Yutian)|CN|S1
YTY|Yangzhou Taizhou Airport|Yangzhou|CN|M1
YTZ|Billy Bishop Toronto City Airport|Toronto|CA|M1
YUA|Yuanmou Air Base|Chuxiong (Yuanmou)|CN|M0
YUB|Tuktoyaktuk / James Gruben Airport|Tuktoyaktuk|CA|S0
YUD|Umiujaq Airport|Umiujaq|CA|S1
YUE|Yuendumu Airport||AU|S0
YUK|Syunik Airport|Kapan|AM|S0
YUL|Montreal / Pierre Elliott Trudeau International Airport|Montréal|CA|L1
YUM|Yuma International Airport / Marine Corps Air Station Yuma|Yuma|US|M1
YUS|Yushu Batang Airport|Yushu (Batang)|CN|M1
YUT|Naujaat Airport|Repulse Bay|CA|S1
YUX|Hall Beach Airport|Sanirajak|CA|M1
YUY|Rouyn Noranda Airport|Rouyn-Noranda|CA|M1
YVB|Bonaventure Airport|Bonaventure|CA|M1
YVC|La Ronge Airport|La Ronge|CA|M1
YVD|Yeva Airport|Yeva|PG|S0
YVE|Vernon Regional Airport|Vernon|CA|M0
YVG|Vermilion Airport|Vermilion|CA|S0
YVM|Qikiqtarjuaq Airport|Qikiqtarjuaq|CA|S1
YVO|Val-d'Or Airport|Val-d'Or|CA|M1
YVP|Kuujjuaq Airport|Kuujjuaq|CA|M1
YVQ|Norman Wells Airport|Norman Wells|CA|M1
YVR|Vancouver International Airport|Vancouver|CA|L1
YVT|Buffalo Narrows Airport|Buffalo Narrows|CA|S0
YVV|Wiarton Airport|Wiarton|CA|M1
YVZ|Deer Lake Airport|Deer Lake|CA|S1
YWB|Kangiqsujuaq (Wakeham Bay) Airport|Kangiqsujuaq|CA|S1
YWG|Winnipeg / James Armstrong Richardson International Airport|Winnipeg|CA|L1
YWJ|Déline Airport|Déline|CA|S1
YWK|Wabush Airport|Wabush|CA|M1
YWL|Williams Lake Airport|Williams Lake|CA|M1
YWM|Williams Harbour Airport|Williams Harbour|CA|S1
YWP|Webequie Airport|Webequie|CA|S1
YWY|Wrigley Airport|Wrigley|CA|M0
YXC|Cranbrook/Canadian Rockies International Airport|Cranbrook|CA|M1
YXE|Saskatoon John G. Diefenbaker International Airport|Saskatoon|CA|L1
YXH|Medicine Hat Regional Airport|Medicine Hat|CA|M1
YXJ|Fort St John / North Peace Regional Airport|Fort Saint John|CA|M1
YXK|Rimouski Airport|Rimouski|CA|M0
YXL|Sioux Lookout Airport|Sioux Lookout|CA|M1
YXN|Whale Cove Airport|Whale Cove|CA|S1
YXP|Pangnirtung Airport|Pangnirtung|CA|S1
YXQ|Beaver Creek Airport|Beaver Creek|CA|M0
YXR|Earlton (Timiskaming Regional) Airport|Earlton|CA|M0
YXS|Prince George (International) Airport|Prince George|CA|M1
YXT|Northwest Regional Airport Terrace-Kitimat|Terrace|CA|M1
YXU|London International Airport|London|CA|M1
YXX|Abbotsford International Airport|Abbotsford|CA|M1
YXY|Whitehorse / Erik Nielsen International Airport|Whitehorse|CA|M1
YXZ|Wawa Airport|Wawa|CA|M0
YYA|Yueyang Sanhe Airport|Yueyang (Yueyanglou)|CN|M1
YYB|North Bay Jack Garland Airport|North Bay|CA|M1
YYC|Calgary International Airport|Calgary|CA|L1
YYD|Smithers Airport|Smithers|CA|M1
YYE|Fort Nelson Airport|Fort Nelson|CA|M1
YYF|Penticton Airport|Penticton|CA|M1
YYG|Charlottetown Airport|Charlottetown|CA|M1
YYH|Taloyoak Airport|Taloyoak|CA|S1
YYJ|Victoria International Airport|Victoria|CA|L1
YYL|Lynn Lake Airport|Lynn Lake|CA|M1
YYM|Cowley Airport|Cowley|CA|S0
YYN|Swift Current Airport|Swift Current|CA|M0
YYQ|Churchill Airport|Churchill|CA|M1
YYR|Goose Bay Airport|Goose Bay|CA|M1
YYT|St. John's International Airport|St. John's|CA|L1
YYU|Kapuskasing Airport|Kapuskasing|CA|M0
YYW|Armstrong Airport|Armstrong|CA|M0
YYY|Mont Joli Airport|Mont-Joli|CA|M1
YYZ|Toronto Pearson International Airport|Toronto|CA|L1
YZA|Cache Creek-Ashcroft Regional Airport|Cache Creek|CA|M0
YZE|Gore Bay Manitoulin Airport|Gore Bay|CA|M0
YZF|Yellowknife International Airport|Yellowknife|CA|M1
YZG|Salluit Airport|Salluit|CA|S1
YZH|Slave Lake Airport|Slave Lake|CA|M0
YZP|Sandspit Airport|Sandspit|CA|M1
YZR|Chris Hadfield Airport|Sarnia|CA|M0
YZS|Coral Harbour Airport|Coral Harbour|CA|M1
YZT|Port Hardy Airport|Port Hardy|CA|M1
YZU|Whitecourt Airport|Whitecourt|CA|M1
YZV|Sept-Îles Airport|Sept-Îles|CA|M1
YZW|Teslin Airport|Teslin|CA|M0
YZX|CFB Greenwood|Greenwood|CA|M0
YZY|Zhangye Ganzhou Airport|Zhangye (Ganzhou)|CN|M1
YZZ|Trail Regional Airport|Trail|CA|S1
ZAC|York Landing Airport|York Landing|CA|S0
ZAD|Zadar Airport|Zadar|HR|L1
ZAG|Zagreb Franjo Tuđman International Airport|Velika Gorica|HR|L1
ZAH|Zahedan International Airport|Zahedan|IR|L1
ZAL|Pichoy Airport|Valdivia|CL|M1
ZAM|Zamboanga International Airport|Zamboanga|PH|L1
ZAO|Cahors Lalbenque airport|Cahors|FR|M0
ZAR|Zaria Airport|Zaria|NG|M0
ZAT|Zhaotong Zhaoyang Airport|Zhaotong|CN|M1
ZAZ|Zaragoza Airport|Zaragoza|ES|L1
ZBE|Zábřeh Dolní Benešov Airfield|Dolní Benešov|CZ|S0
ZBF|Bathurst Airport|South Tetagouche|CA|M1
ZBL|Biloela Airport|Biloela|AU|S0
ZBM|Bromont (Roland Désourdy) Airport|Bromont|CA|M0
ZBO|Bowen Airport|Bowen|AU|S0
ZBR|Chabahar Konarak International Airport|Konarak|IR|M1
ZBY|Sayaboury Airport|Sainyabuli|LA|S0
ZCL|General Leobardo C. Ruiz International Airport|Zacatecas|MX|M1
ZCO|La Araucanía International Airport|Temuco|CL|L1
ZDY|Delma Airport|Delma Island|AE|S1
ZEC|Secunda Airport|Secunda|ZA|M0
ZEG|Senggo Airport|Senggo-Papua Island|ID|S0
ZEL|Bella Bella (Campbell Island) Airport|Bella Bella|CA|M1
ZEM|Eastmain River Airport|Eastmain River|CA|S1
ZEN|Zenag Airport|Zenag|PG|S0
ZER|Ziro Airport|Ziro|IN|M0
ZFA|Faro Airport|Faro|CA|M0
ZFD|Fond-du-Lac Airport|Fond-du-Lac|CA|S1
ZFL|Zhaosu Tianma Airport|Zhaosu|CN|S1
ZFM|Fort Mcpherson Airport|Fort Mcpherson|CA|S1
ZFN|Tulita Airport|Tulita|CA|S1
ZFW|Fairview Airport|Fairview|CA|S0
ZGF|Grand Forks Airport|Grand Forks|CA|M0
ZGI|Gods River Airport|Gods River|CA|S1
ZGL|South Galway Airport||AU|S0
ZGM|Ngoma Airport|Ngoma|ZM|S0
ZGR|Little Grand Rapids Airport|Little Grand Rapids|CA|S0
ZGS|La Romaine Airport|Le Golfe-du-Saint-Laurent|CA|S1
ZGU|Gaua Island Airport|Gaua Island|VU|M0
ZHA|Zhanjiang Wuchuan International Airport|Zhanjiang|CN|L1
ZHM|Shamshernagar Airport|Shamshernagar|BD|S0
ZHP|High Prairie Airport|High Prairie|CA|S0
ZHY|Zhongwei Shapotou Airport|Zhongwei (Shapotou)|CN|M1
ZIA|Zhukovsky International Airport|Moscow|RU|L1
ZIC|Victoria Airport|Victoria|CL|M0
ZIG|Ziguinchor Airport|Ziguinchor|SN|M1
ZIH|Ixtapa-Zihuatanejo International Airport|Ixtapa|MX|L1
ZIS|Alzintan Airport|Zintan|LY|S0
ZIX|Zhigansk Airport|Zhigansk|RU|M1
ZJG|Jenpeg Airport|Jenpeg|CA|M0
ZJN|Swan River Airport|Swan River|CA|M0
ZKB|Kasaba Bay Airport|Kasaba Bay|ZM|S0
ZKE|Kashechewan Airport|Kashechewan|CA|S1
ZKG|Kégashka Airport|Côte-Nord-du-Golfe-du-Saint-Laurent|CA|S0
ZKL|Zigong Fengming Airport|Zigong (Gongjing)|CN|S0
ZKP|Zyryanka Airport|Zyryanka|RU|M1
ZLO|Playa de Oro International Airport|Manzanillo|MX|M1
ZLR|Municipal de Linares Airport|Linares|CL|S0
ZLT|La Tabatière Airport|La Tabatière|CA|S1
ZLX|Zalingei Airport|Zalingei|SD|S0
ZMD|Sena Madureira Airport|Sena Madureira|BR|S0
ZMH|South Cariboo Region / 108 Mile Airport|108 Mile|CA|S0
ZMM|Zamora Airport|Zamora|MX|S0
ZMT|Masset Airport|Masset|CA|M1
ZNC|Nyac Airport|Nyac|US|S0
ZND|Zinder Airport|Zinder|NE|M1
ZNE|Newman Airport|Newman|AU|M1
ZNZ|Abeid Amani Karume International Airport|Zanzibar|TZ|L1
ZOS|Cañal Bajo Carlos Hott Siebert Airport|Osorno|CL|M1
ZPB|Sachigo Lake Airport|Sachigo Lake|CA|S1
ZPC|Pucón Airport|Pucon|CL|S1
ZPH|Zephyrhills Municipal Airport|Zephyrhills|US|S0
ZPO|Pinehouse Lake Airport|Pinehouse Lake|CA|S0
ZQN|Queenstown Airport|Queenstown|NZ|L1
ZQW|Zweibrücken Airport|Zweibrücken|DE|S0
ZQZ|Zhangjiakou Ningyuan Airport|Zhangjiakou|CN|M1
ZRH|Zürich Airport|Zurich|CH|L1
ZRI|Stevanus Rumbewas Airport|Serui|ID|M0
ZRJ|Round Lake (Weagamow Lake) Airport|Round Lake|CA|S1
ZRM|Mararena Sarmi Airport|Sarmi|ID|S0
ZSA|San Salvador International Airport|San Salvador|BS|L1
ZSE|Saint-Pierre Pierrefonds Airport|Saint-Pierre|RE|L1
ZSJ|Sandy Lake Airport|Sandy Lake|CA|M1
ZSS|Sassandra Airport|Sassandra|CI|S0
ZST|Stewart Airport|Stewart|CA|M0
ZTA|Tureia Airport|Tureia|PF|S0
ZTB|Tête-à-la-Baleine Airport|Tête-à-la-Baleine|CA|S1
ZTH|Zakynthos International Airport "Dionysios Solomos"|Zakynthos|GR|L1
ZTM|Shamattawa Airport|Shamattawa|CA|S1
ZTR|Zhytomyr Airport|Zhytomyr|UA|M0
ZTU|Zaqatala International Airport|Zaqatala|AZ|M0
ZUC|Ignace Municipal Airport|Ignace|CA|M0
ZUD|Pupelde Airport|Ancud|CL|S0
ZUH|Zhuhai Jinwan Airport|Zhuhai (Jinwan)|CN|L1
ZUL|Zilfi Airport|Zilfi|SA|S0
ZUM|Churchill Falls Airport|Churchill Falls|CA|S1
ZVA|Miandrivazo Airport|Miandrivazo|MG|M0
ZVG|Springvale Airport|Springvale|AU|S0
ZVK|Savannakhet Airport||LA|M0
ZWA|Andapa Airport||MG|M0
ZWL|Wollaston Lake Airport|Wollaston Lake|CA|S1
ZXT|Zabrat Airport|Zabrat|AZ|M0
ZYI|Zunyi Xinzhou Airport|Zunyi|CN|M1
ZYL|Osmany International Airport|Sylhet|BD|L1
ZZE|Zangilan International Airport|Zangilan|AZ|S0
ZZO|Zonalnoye Airport|Tymovskoye|RU|S0
ZZU|Mzuzu Airport|Mzuzu|MW|M0
ZZV|Zanesville Municipal Airport|Zanesville|US|M0
`;
