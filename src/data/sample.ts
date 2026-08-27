// Source arrays for the built-in sample database — a small music-store schema
// (artists → albums → tracks, customers → invoices → invoice items). The
// builder in src/lib/sample.ts turns these into rows deterministically.

export interface ArtistSeed {
  name: string;
  country: string;
  albums: { title: string; year: number; genre: string; tracks: number }[];
}

export const GENRES = ['Rock', 'Jazz', 'Electronic', 'Classical', 'Hip hop', 'Folk'] as const;

export const ARTISTS: ArtistSeed[] = [
  {
    name: 'The Copper Kettles',
    country: 'United Kingdom',
    albums: [
      { title: 'Rust and Rain', year: 2014, genre: 'Rock', tracks: 10 },
      { title: 'Low Tide Sessions', year: 2018, genre: 'Folk', tracks: 8 },
    ],
  },
  {
    name: 'Mara Lindqvist',
    country: 'Sweden',
    albums: [
      { title: 'Northern Quiet', year: 2016, genre: 'Folk', tracks: 9 },
      { title: 'Salt Lamps', year: 2021, genre: 'Electronic', tracks: 7 },
    ],
  },
  {
    name: 'Orbit Foundry',
    country: 'Germany',
    albums: [
      { title: 'Signal Bloom', year: 2019, genre: 'Electronic', tracks: 11 },
      { title: 'Mesh', year: 2023, genre: 'Electronic', tracks: 8 },
    ],
  },
  {
    name: 'Delphine Aubert Quartet',
    country: 'France',
    albums: [
      { title: 'Blue Hours', year: 2012, genre: 'Jazz', tracks: 8 },
      { title: 'Ninth Arrondissement', year: 2017, genre: 'Jazz', tracks: 9 },
    ],
  },
  {
    name: 'Kenji Watanabe',
    country: 'Japan',
    albums: [{ title: 'Studies for Piano', year: 2015, genre: 'Classical', tracks: 12 }],
  },
  {
    name: 'Halcyon Street',
    country: 'United States',
    albums: [
      { title: 'Concrete Sunrise', year: 2013, genre: 'Hip hop', tracks: 12 },
      { title: 'Second Wind', year: 2020, genre: 'Hip hop', tracks: 10 },
    ],
  },
  {
    name: 'Ines Ferreira',
    country: 'Portugal',
    albums: [{ title: 'Atlantic Letters', year: 2022, genre: 'Folk', tracks: 9 }],
  },
  {
    name: 'The Verdant Choir',
    country: 'Canada',
    albums: [{ title: 'Hymns for Machines', year: 2019, genre: 'Classical', tracks: 8 }],
  },
  {
    name: 'Tomas Reyes',
    country: 'Argentina',
    albums: [
      { title: 'Tango Deconstructed', year: 2011, genre: 'Jazz', tracks: 7 },
      { title: 'Buenos Noches', year: 2016, genre: 'Rock', tracks: 10 },
    ],
  },
  {
    name: 'Prism Static',
    country: 'Australia',
    albums: [{ title: 'Tidal Loop', year: 2024, genre: 'Electronic', tracks: 9 }],
  },
  {
    name: 'Amara Okafor',
    country: 'Nigeria',
    albums: [{ title: 'Lagos After Dark', year: 2020, genre: 'Hip hop', tracks: 11 }],
  },
  {
    name: 'Bergen Brass Ensemble',
    country: 'Norway',
    albums: [{ title: 'Fjord Suites', year: 2010, genre: 'Classical', tracks: 6 }],
  },
];

export const TRACK_WORDS_A = [
  'Silver', 'Broken', 'Midnight', 'Paper', 'Velvet', 'Hollow', 'Golden', 'Quiet', 'Neon', 'Distant',
  'Wild', 'Amber', 'Glass', 'Slow', 'Winter', 'Electric', 'Hidden', 'Open', 'Crooked', 'Falling',
];

export const TRACK_WORDS_B = [
  'Harbour', 'Engine', 'Garden', 'Signal', 'Window', 'Highway', 'River', 'Lantern', 'Compass', 'Orchard',
  'Station', 'Circuit', 'Meadow', 'Skyline', 'Ladder', 'Mirror', 'Canyon', 'Parade', 'Thread', 'Summer',
];

export interface CustomerSeed {
  first: string;
  last: string;
  city: string;
  country: string;
}

export const CUSTOMERS: CustomerSeed[] = [
  { first: 'Lena', last: 'Hoffmann', city: 'Berlin', country: 'Germany' },
  { first: 'Diego', last: 'Salazar', city: 'Madrid', country: 'Spain' },
  { first: 'Priya', last: 'Raman', city: 'Bengaluru', country: 'India' },
  { first: 'Noah', last: 'Whitfield', city: 'Austin', country: 'United States' },
  { first: 'Chloe', last: 'Martin', city: 'Lyon', country: 'France' },
  { first: 'Yusuf', last: 'Demir', city: 'Istanbul', country: 'Turkey' },
  { first: 'Hanna', last: 'Virtanen', city: 'Helsinki', country: 'Finland' },
  { first: 'Mateus', last: 'Oliveira', city: 'Porto', country: 'Portugal' },
  { first: 'Grace', last: 'Nakamura', city: 'Osaka', country: 'Japan' },
  { first: 'Liam', last: 'Byrne', city: 'Dublin', country: 'Ireland' },
  { first: 'Sofia', last: 'Rossi', city: 'Milan', country: 'Italy' },
  { first: 'Ethan', last: 'Clarke', city: 'Toronto', country: 'Canada' },
  { first: 'Zanele', last: 'Mokoena', city: 'Cape Town', country: 'South Africa' },
  { first: 'Oskar', last: 'Nowak', city: 'Krakow', country: 'Poland' },
  { first: 'Isabel', last: 'Costa', city: 'Sao Paulo', country: 'Brazil' },
  { first: 'Felix', last: 'Bauer', city: 'Vienna', country: 'Austria' },
  { first: 'Aisha', last: 'Bello', city: 'Abuja', country: 'Nigeria' },
  { first: 'Ruby', last: 'Thompson', city: 'Melbourne', country: 'Australia' },
  { first: 'Jonas', last: 'Eriksen', city: 'Copenhagen', country: 'Denmark' },
  { first: 'Mei', last: 'Chen', city: 'Taipei', country: 'Taiwan' },
];
