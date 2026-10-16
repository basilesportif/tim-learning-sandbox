// Curated 2026-27 club list (source: en.wikipedia "2026–27 La Liga" and
// "2026–27 Serie A", Teams / Stadiums and locations sections; see DATA.md).
//
// `club`, `venue` and `cityPage` are en.wikipedia article titles. They are
// resolved to Wikidata items by build-teams.mjs: the venue gives lat/lon (P625)
// and the city gives the population (P1082). `city` is the English display name.
// `venue` is the stadium the club actually plays in for 2026-27 (this can differ
// from the club's Wikidata P115 during temporary moves - see DATA.md).

export const CLUBS = [
  // ---- La Liga (Spain) ----
  { slug: 'alaves', name: 'Deportivo Alavés', shortName: 'Alavés', league: 'La Liga', club: 'Deportivo Alavés', venue: 'Mendizorrotza Stadium', city: 'Vitoria-Gasteiz', cityPage: 'Vitoria-Gasteiz' },
  { slug: 'athletic-club', name: 'Athletic Club', shortName: 'Athletic', league: 'La Liga', club: 'Athletic Bilbao', venue: 'San Mamés Stadium (2013)', city: 'Bilbao', cityPage: 'Bilbao' },
  { slug: 'atletico-madrid', name: 'Atlético Madrid', shortName: 'Atlético', league: 'La Liga', club: 'Atlético Madrid', venue: 'Metropolitano Stadium', city: 'Madrid', cityPage: 'Madrid' },
  { slug: 'barcelona', name: 'FC Barcelona', shortName: 'Barcelona', league: 'La Liga', club: 'FC Barcelona', venue: 'Camp Nou', city: 'Barcelona', cityPage: 'Barcelona' },
  { slug: 'celta-vigo', name: 'Celta Vigo', shortName: 'Celta', league: 'La Liga', club: 'RC Celta de Vigo', venue: 'Balaídos Stadium', city: 'Vigo', cityPage: 'Vigo' },
  { slug: 'deportivo-la-coruna', name: 'Deportivo de La Coruña', shortName: 'Deportivo', league: 'La Liga', club: 'Deportivo de La Coruña', venue: 'Estadio Riazor', city: 'A Coruña', cityPage: 'A Coruña' },
  { slug: 'elche', name: 'Elche CF', shortName: 'Elche', league: 'La Liga', club: 'Elche CF', venue: 'Estadio Martínez Valero', city: 'Elche', cityPage: 'Elche' },
  { slug: 'espanyol', name: 'RCD Espanyol', shortName: 'Espanyol', league: 'La Liga', club: 'RCD Espanyol', venue: 'RCDE Stadium', city: 'Cornellà de Llobregat', cityPage: 'Cornellà de Llobregat' },
  { slug: 'getafe', name: 'Getafe CF', shortName: 'Getafe', league: 'La Liga', club: 'Getafe CF', venue: 'Estadio Coliseum', city: 'Getafe', cityPage: 'Getafe' },
  { slug: 'levante', name: 'Levante UD', shortName: 'Levante', league: 'La Liga', club: 'Levante UD', venue: 'Estadi Ciutat de València', city: 'Valencia', cityPage: 'Valencia' },
  { slug: 'malaga', name: 'Málaga CF', shortName: 'Málaga', league: 'La Liga', club: 'Málaga CF', venue: 'Estadio La Rosaleda', city: 'Málaga', cityPage: 'Málaga' },
  { slug: 'osasuna', name: 'CA Osasuna', shortName: 'Osasuna', league: 'La Liga', club: 'CA Osasuna', venue: 'El Sadar Stadium', city: 'Pamplona', cityPage: 'Pamplona' },
  { slug: 'racing-santander', name: 'Racing Santander', shortName: 'Racing', league: 'La Liga', club: 'Racing de Santander', venue: 'Campos de Sport de El Sardinero', city: 'Santander', cityPage: 'Santander, Spain' },
  { slug: 'rayo-vallecano', name: 'Rayo Vallecano', shortName: 'Rayo', league: 'La Liga', club: 'Rayo Vallecano', venue: 'Vallecas Stadium', city: 'Madrid', cityPage: 'Madrid' },
  { slug: 'real-betis', name: 'Real Betis', shortName: 'Betis', league: 'La Liga', club: 'Real Betis', venue: 'Estadio de La Cartuja', city: 'Seville', cityPage: 'Seville' },
  { slug: 'real-madrid', name: 'Real Madrid', shortName: 'Real Madrid', league: 'La Liga', club: 'Real Madrid CF', venue: 'Bernabéu (stadium)', city: 'Madrid', cityPage: 'Madrid' },
  { slug: 'real-sociedad', name: 'Real Sociedad', shortName: 'Real Sociedad', league: 'La Liga', club: 'Real Sociedad', venue: 'Anoeta Stadium', city: 'San Sebastián', cityPage: 'San Sebastián' },
  { slug: 'sevilla', name: 'Sevilla FC', shortName: 'Sevilla', league: 'La Liga', club: 'Sevilla FC', venue: 'Ramón Sánchez-Pizjuán Stadium', city: 'Seville', cityPage: 'Seville' },
  { slug: 'valencia', name: 'Valencia CF', shortName: 'Valencia', league: 'La Liga', club: 'Valencia CF', venue: 'Mestalla Stadium', city: 'Valencia', cityPage: 'Valencia' },
  { slug: 'villarreal', name: 'Villarreal CF', shortName: 'Villarreal', league: 'La Liga', club: 'Villarreal CF', venue: 'Estadio de la Cerámica', city: 'Villarreal', cityPage: 'Villarreal' },

  // ---- Serie A (Italy) ----
  { slug: 'atalanta', name: 'Atalanta', shortName: 'Atalanta', league: 'Serie A', club: 'Atalanta BC', venue: 'Stadio di Bergamo', city: 'Bergamo', cityPage: 'Bergamo' },
  { slug: 'bologna', name: 'Bologna', shortName: 'Bologna', league: 'Serie A', club: 'Bologna FC 1909', venue: "Stadio Renato Dall'Ara", city: 'Bologna', cityPage: 'Bologna' },
  { slug: 'cagliari', name: 'Cagliari', shortName: 'Cagliari', league: 'Serie A', club: 'Cagliari Calcio', venue: 'Unipol Domus', city: 'Cagliari', cityPage: 'Cagliari' },
  { slug: 'como', name: 'Como', shortName: 'Como', league: 'Serie A', club: 'Como 1907', venue: 'Stadio Giuseppe Sinigaglia', city: 'Como', cityPage: 'Como' },
  { slug: 'fiorentina', name: 'Fiorentina', shortName: 'Fiorentina', league: 'Serie A', club: 'ACF Fiorentina', venue: 'Stadio Artemio Franchi', city: 'Florence', cityPage: 'Florence' },
  { slug: 'frosinone', name: 'Frosinone', shortName: 'Frosinone', league: 'Serie A', club: 'Frosinone Calcio', venue: 'Stadio Benito Stirpe', city: 'Frosinone', cityPage: 'Frosinone' },
  { slug: 'genoa', name: 'Genoa', shortName: 'Genoa', league: 'Serie A', club: 'Genoa CFC', venue: 'Stadio Luigi Ferraris', city: 'Genoa', cityPage: 'Genoa' },
  { slug: 'inter', name: 'Inter Milan', shortName: 'Inter', league: 'Serie A', club: 'Inter Milan', venue: 'San Siro', city: 'Milan', cityPage: 'Milan' },
  { slug: 'juventus', name: 'Juventus', shortName: 'Juventus', league: 'Serie A', club: 'Juventus FC', venue: 'Juventus Stadium', city: 'Turin', cityPage: 'Turin' },
  { slug: 'lazio', name: 'Lazio', shortName: 'Lazio', league: 'Serie A', club: 'SS Lazio', venue: 'Stadio Olimpico', city: 'Rome', cityPage: 'Rome' },
  { slug: 'lecce', name: 'Lecce', shortName: 'Lecce', league: 'Serie A', club: 'US Lecce', venue: 'Stadio Via del mare', city: 'Lecce', cityPage: 'Lecce' },
  { slug: 'milan', name: 'AC Milan', shortName: 'Milan', league: 'Serie A', club: 'AC Milan', venue: 'San Siro', city: 'Milan', cityPage: 'Milan' },
  { slug: 'monza', name: 'Monza', shortName: 'Monza', league: 'Serie A', club: 'AC Monza', venue: 'Stadio Brianteo', city: 'Monza', cityPage: 'Monza' },
  { slug: 'napoli', name: 'Napoli', shortName: 'Napoli', league: 'Serie A', club: 'SSC Napoli', venue: 'Stadio Diego Armando Maradona', city: 'Naples', cityPage: 'Naples' },
  { slug: 'parma', name: 'Parma', shortName: 'Parma', league: 'Serie A', club: 'Parma Calcio 1913', venue: 'Stadio Ennio Tardini', city: 'Parma', cityPage: 'Parma' },
  { slug: 'roma', name: 'AS Roma', shortName: 'Roma', league: 'Serie A', club: 'AS Roma', venue: 'Stadio Olimpico', city: 'Rome', cityPage: 'Rome' },
  { slug: 'sassuolo', name: 'Sassuolo', shortName: 'Sassuolo', league: 'Serie A', club: 'US Sassuolo Calcio', venue: 'Mapei Stadium – Città del Tricolore', city: 'Reggio Emilia', cityPage: 'Reggio Emilia' },
  { slug: 'torino', name: 'Torino', shortName: 'Torino', league: 'Serie A', club: 'Torino FC', venue: 'Stadio Olimpico Grande Torino', city: 'Turin', cityPage: 'Turin' },
  { slug: 'udinese', name: 'Udinese', shortName: 'Udinese', league: 'Serie A', club: 'Udinese Calcio', venue: 'Stadio Friuli', city: 'Udine', cityPage: 'Udine' },
  { slug: 'venezia', name: 'Venezia', shortName: 'Venezia', league: 'Serie A', club: 'Venezia FC', venue: 'Stadio Pier Luigi Penzo', city: 'Venice', cityPage: 'Venice' },
]

export const COUNTRY_BY_LEAGUE = { 'La Liga': 'Spain', 'Serie A': 'Italy' }
