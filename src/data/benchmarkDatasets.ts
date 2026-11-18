import type {
  BlockingRule,
  DatabaseRecord,
  DatasetPreset,
  FieldSchema,
} from '../types/linkage';

const DEFAULT_PERSON_FIELDS: FieldSchema[] = [
  {
    key: 'given_name',
    label: 'Given Name',
    comparator: 'jaro_winkler',
    agreeThreshold: 0.92,
    partialThreshold: 0.78,
    mAgree: 0.9,
    uAgree: 0.03,
    mPartial: 0.07,
    uPartial: 0.06,
    enabled: true,
  },
  {
    key: 'surname',
    label: 'Surname',
    comparator: 'jaro_winkler',
    agreeThreshold: 0.92,
    partialThreshold: 0.78,
    mAgree: 0.92,
    uAgree: 0.02,
    mPartial: 0.05,
    uPartial: 0.05,
    enabled: true,
  },
  {
    key: 'dob',
    label: 'Date of Birth',
    comparator: 'date_tolerance',
    agreeThreshold: 0.96,
    partialThreshold: 0.82,
    mAgree: 0.94,
    uAgree: 0.005,
    mPartial: 0.04,
    uPartial: 0.02,
    enabled: true,
  },
  {
    key: 'gender',
    label: 'Sex / Gender',
    comparator: 'exact',
    agreeThreshold: 0.99,
    partialThreshold: 0.9,
    mAgree: 0.96,
    uAgree: 0.5,
    mPartial: 0.01,
    uPartial: 0.01,
    enabled: true,
  },
  {
    key: 'street',
    label: 'Street Address',
    comparator: 'token_jaccard',
    agreeThreshold: 0.88,
    partialThreshold: 0.6,
    mAgree: 0.82,
    uAgree: 0.01,
    mPartial: 0.12,
    uPartial: 0.04,
    enabled: true,
  },
  {
    key: 'postal_code',
    label: 'Postal Code',
    comparator: 'levenshtein',
    agreeThreshold: 0.95,
    partialThreshold: 0.78,
    mAgree: 0.88,
    uAgree: 0.04,
    mPartial: 0.07,
    uPartial: 0.08,
    enabled: true,
  },
  {
    key: 'national_id',
    label: 'National / Health ID',
    comparator: 'exact',
    agreeThreshold: 0.99,
    partialThreshold: 0.85,
    mAgree: 0.97,
    uAgree: 0.001,
    mPartial: 0.01,
    uPartial: 0.005,
    enabled: true,
  },
];

const DEFAULT_PERSON_BLOCKING: BlockingRule[] = [
  {
    id: 'blk_soundex_surname_year',
    label: 'Soundex(Surname) + Birth Year',
    keyParts: [
      { field: 'surname', transform: 'soundex' },
      { field: 'dob', transform: 'year' },
    ],
    enabled: true,
  },
  {
    id: 'blk_soundex_given_postal',
    label: 'Soundex(Given Name) + Postal Prefix(3)',
    keyParts: [
      { field: 'given_name', transform: 'soundex' },
      { field: 'postal_code', transform: 'prefix_3' },
    ],
    enabled: true,
  },
  {
    id: 'blk_dob_gender',
    label: 'Exact DOB + Gender',
    keyParts: [
      { field: 'dob', transform: 'alnum_only' },
      { field: 'gender', transform: 'exact' },
    ],
    enabled: true,
  },
];

const HEALTHCARE_A: DatabaseRecord[] = [
  { id: 'EHR-1001', source: 'A', groundTruthId: 'ENT-01', fields: { given_name: 'Catherine', surname: 'OConnor', dob: '1984-04-11', gender: 'F', street: '422 Oakwood Boulevard Apt 4B', postal_code: '94110', national_id: 'NH-88412' } },
  { id: 'EHR-1002', source: 'A', groundTruthId: 'ENT-02', fields: { given_name: 'Marcus', surname: 'Vandenberg', dob: '1972-09-23', gender: 'M', street: '18 Maple Ridge Road', postal_code: '94107', national_id: 'NH-45109' } },
  { id: 'EHR-1003', source: 'A', groundTruthId: 'ENT-03', fields: { given_name: 'Stephanie', surname: 'Kowalski', dob: '1991-12-03', gender: 'F', street: '905 Pinecrest Avenue Suite 2', postal_code: '94114', national_id: 'NH-77301' } },
  { id: 'EHR-1004', source: 'A', groundTruthId: 'ENT-04', fields: { given_name: 'Benjamin', surname: 'Alvarez', dob: '1965-06-17', gender: 'M', street: '77 Cedar Lane', postal_code: '94103', national_id: 'NH-22984' } },
  { id: 'EHR-1005', source: 'A', groundTruthId: 'ENT-05', fields: { given_name: 'Amina', surname: 'Mansour', dob: '1988-02-28', gender: 'F', street: '310 Valencia Street', postal_code: '94110', national_id: 'NH-60219' } },
  { id: 'EHR-1006', source: 'A', groundTruthId: 'ENT-06', fields: { given_name: 'Thomas', surname: 'Smythe', dob: '1979-08-14', gender: 'M', street: '1450 Market Street Apt 12', postal_code: '94102', national_id: 'NH-51204' } },
  { id: 'EHR-1007', source: 'A', groundTruthId: 'ENT-07', fields: { given_name: 'Elena', surname: 'Rostova', dob: '1995-05-09', gender: 'F', street: '64 Lombard Street', postal_code: '94111', national_id: 'NH-90312' } },
  { id: 'EHR-1008', source: 'A', groundTruthId: 'ENT-08', fields: { given_name: 'Daniel', surname: 'Keller', dob: '1981-11-30', gender: 'M', street: '218 Mission Street', postal_code: '94105', national_id: 'NH-33908' } },
  { id: 'EHR-1009', source: 'A', groundTruthId: 'ENT-09', fields: { given_name: 'Priya', surname: 'Subramanian', dob: '1990-07-21', gender: 'F', street: '512 Hayes Street', postal_code: '94102', national_id: 'NH-67441' } },
  { id: 'EHR-1010', source: 'A', groundTruthId: 'ENT-10', fields: { given_name: 'Jonathan', surname: 'Mercer', dob: '1958-03-19', gender: 'M', street: '89 Chestnut Drive', postal_code: '94109', national_id: 'NH-11820' } },
  { id: 'EHR-1011', source: 'A', groundTruthId: 'ENT-11', fields: { given_name: 'Hannah', surname: 'Mercer', dob: '1958-03-19', gender: 'F', street: '89 Chestnut Drive', postal_code: '94109', national_id: 'NH-11821' } },
  { id: 'EHR-1012', source: 'A', groundTruthId: 'ENT-12', fields: { given_name: 'Lucas', surname: 'Lindqvist', dob: '1986-10-05', gender: 'M', street: '740 Fulton Street', postal_code: '94117', national_id: 'NH-49022' } },
  { id: 'EHR-1013', source: 'A', groundTruthId: 'ENT-13', fields: { given_name: 'Rachel', surname: 'Goldstein', dob: '1976-01-25', gender: 'F', street: '192 Divisadero Street', postal_code: '94117', national_id: 'NH-30911' } },
  { id: 'EHR-1014', source: 'A', groundTruthId: 'ENT-14', fields: { given_name: 'Samuel', surname: 'Osei', dob: '1993-04-02', gender: 'M', street: '408 Bryant Street', postal_code: '94107', national_id: 'NH-82190' } },
  { id: 'EHR-1015', source: 'A', groundTruthId: 'ENT-15', fields: { given_name: 'Claire', surname: 'Beaumont', dob: '1982-07-12', gender: 'F', street: '15 Sutter Place', postal_code: '94104', national_id: 'NH-55012' } },
  { id: 'EHR-1016', source: 'A', groundTruthId: 'ENT-16', fields: { given_name: 'David', surname: 'Chen', dob: '1974-11-08', gender: 'M', street: '620 Stockton Street', postal_code: '94108', national_id: 'NH-28411' } },
  { id: 'EHR-1017', source: 'A', groundTruthId: 'ENT-17', fields: { given_name: 'Nadia', surname: 'Haddad', dob: '1989-08-29', gender: 'F', street: '330 Guerrero Street', postal_code: '94103', national_id: 'NH-71049' } },
  { id: 'EHR-1018', source: 'A', groundTruthId: 'ENT-18', fields: { given_name: 'Gregory', surname: 'Whitman', dob: '1969-02-14', gender: 'M', street: '941 Polk Street', postal_code: '94109', national_id: 'NH-19044' } },
];

const HEALTHCARE_B: DatabaseRecord[] = [
  // Clean & noisy matches
  { id: 'CLN-401', source: 'B', groundTruthId: 'ENT-01', fields: { given_name: 'Katherine', surname: "O'Connor", dob: '1984-11-04', gender: 'F', street: '422 Oakwood Blvd 4B', postal_code: '94110', national_id: '' } },
  { id: 'CLN-402', source: 'B', groundTruthId: 'ENT-02', fields: { given_name: 'Marcus', surname: 'Van Den Berg', dob: '1972-09-23', gender: 'M', street: '18 Maple Ridge Rd', postal_code: '94107', national_id: 'NH-45109' } },
  { id: 'CLN-403', source: 'B', groundTruthId: 'ENT-03', fields: { given_name: 'Stefanie', surname: 'Kowalsky', dob: '1991-12-03', gender: 'F', street: '905 Pinecrest Ave Ste 2', postal_code: '94114', national_id: '' } },
  { id: 'CLN-404', source: 'B', groundTruthId: 'ENT-04', fields: { given_name: 'Ben', surname: 'Alvarez', dob: '1965-06-17', gender: 'M', street: '77 Cedar Ln', postal_code: '94103', national_id: '' } },
  { id: 'CLN-405', source: 'B', groundTruthId: 'ENT-05', fields: { given_name: 'Amina', surname: 'Mansour', dob: '1988-02-28', gender: 'F', street: '310 Valencia St', postal_code: '94110', national_id: 'NH-60219' } },
  { id: 'CLN-406', source: 'B', groundTruthId: 'ENT-06', fields: { given_name: 'Tomas', surname: 'Smith', dob: '1979-08-14', gender: 'M', street: '1450 Market St #12', postal_code: '94102', national_id: '' } },
  { id: 'CLN-407', source: 'B', groundTruthId: 'ENT-07', fields: { given_name: 'Elena', surname: 'Rostova', dob: '1995-05-09', gender: 'F', street: '64 Lombard St', postal_code: '94111', national_id: 'NH-90312' } },
  // Ambiguous clerical review cases (address moved + partial typo + missing ID)
  { id: 'CLN-408', source: 'B', groundTruthId: 'ENT-08', fields: { given_name: 'Dan', surname: 'Keller', dob: '1981-11-30', gender: 'M', street: '812 Folsom Street', postal_code: '94107', national_id: '' } },
  { id: 'CLN-409', source: 'B', groundTruthId: 'ENT-09', fields: { given_name: 'Priya', surname: 'Subramanyan', dob: '1990-07-21', gender: 'F', street: '512 Hayes St', postal_code: '94102', national_id: '' } },
  // Twin / household trap: Jonathan Mercer is ENT-10; Hannah Mercer is ENT-11
  { id: 'CLN-410', source: 'B', groundTruthId: 'ENT-10', fields: { given_name: 'John', surname: 'Mercer', dob: '1958-03-19', gender: 'M', street: '89 Chestnut Dr', postal_code: '94109', national_id: '' } },
  { id: 'CLN-411', source: 'B', groundTruthId: 'ENT-12', fields: { given_name: 'Lukas', surname: 'Lindqvist', dob: '1986-10-05', gender: 'M', street: '740 Fulton St', postal_code: '94117', national_id: 'NH-49022' } },
  // Surname hyphenation / change -> lands in Clerical Review
  { id: 'CLN-412', source: 'B', groundTruthId: 'ENT-13', fields: { given_name: 'Rachel', surname: 'Goldstein-Weiss', dob: '1976-01-25', gender: 'F', street: '192 Divisadero St', postal_code: '94117', national_id: '' } },
  { id: 'CLN-413', source: 'B', groundTruthId: 'ENT-14', fields: { given_name: 'Samuel', surname: 'Osei', dob: '1993-04-02', gender: 'M', street: '408 Bryant St', postal_code: '94107', national_id: 'NH-82190' } },
  // Unmatched unique records in Clinic DB
  { id: 'CLN-414', source: 'B', groundTruthId: 'ENT-901', fields: { given_name: 'Oliver', surname: 'Mercer', dob: '1958-03-19', gender: 'M', street: '450 Gough Street', postal_code: '94102', national_id: 'NH-99101' } },
  { id: 'CLN-415', source: 'B', groundTruthId: 'ENT-902', fields: { given_name: 'Sophia', surname: 'Alvarez', dob: '1965-06-17', gender: 'F', street: '77 Cedar Lane', postal_code: '94103', national_id: 'NH-22985' } },
  { id: 'CLN-416', source: 'B', groundTruthId: 'ENT-903', fields: { given_name: 'Mateo', surname: 'Delgado', dob: '1992-09-11', gender: 'M', street: '1122 Howard Street', postal_code: '94103', national_id: 'NH-81722' } },
  { id: 'CLN-417', source: 'B', groundTruthId: 'ENT-904', fields: { given_name: 'Hannah', surname: 'Keller', dob: '1981-11-30', gender: 'F', street: '218 Mission Street', postal_code: '94105', national_id: 'NH-33909' } },
  { id: 'CLN-418', source: 'B', groundTruthId: 'ENT-905', fields: { given_name: 'Victor', surname: 'Chen', dob: '1974-11-08', gender: 'M', street: '980 Sutter Street', postal_code: '94109', national_id: 'NH-28499' } },
];

const CIVIL_A: DatabaseRecord[] = [
  { id: 'TAX-201', source: 'A', groundTruthId: 'CIV-01', fields: { given_name: 'alexander', surname: 'petrov', dob: '1977-03-14', gender: 'M', street: '1240 Elmhurst Avenue', postal_code: '60614', national_id: 'TX-44901' } },
  { id: 'TAX-202', source: 'A', groundTruthId: 'CIV-02', fields: { given_name: 'beatrice', surname: 'fontaine', dob: '1983-07-08', gender: 'F', street: '55 Halsted Street', postal_code: '60607', national_id: 'TX-55210' } },
  { id: 'TAX-203', source: 'A', groundTruthId: 'CIV-03', fields: { given_name: 'christopher', surname: 'gallagher', dob: '1968-11-22', gender: 'M', street: '809 Clark Street Apt 3', postal_code: '60610', national_id: 'TX-18231' } },
  { id: 'TAX-204', source: 'A', groundTruthId: 'CIV-04', fields: { given_name: 'fatima', surname: 'al-mansoor', dob: '1994-01-19', gender: 'F', street: '3020 Lincoln Avenue', postal_code: '60657', national_id: 'TX-90122' } },
  { id: 'TAX-205', source: 'A', groundTruthId: 'CIV-05', fields: { given_name: 'henrik', surname: 'sorensen', dob: '1980-05-27', gender: 'M', street: '412 Belmont Avenue', postal_code: '60657', national_id: 'TX-61028' } },
  { id: 'TAX-206', source: 'A', groundTruthId: 'CIV-06', fields: { given_name: 'isabella', surname: 'marchetti', dob: '1987-09-02', gender: 'F', street: '719 Taylor Street', postal_code: '60607', national_id: 'TX-73810' } },
  { id: 'TAX-207', source: 'A', groundTruthId: 'CIV-07', fields: { given_name: 'jerome', surname: 'washington', dob: '1971-12-15', gender: 'M', street: '2250 Cottage Grove Ave', postal_code: '60616', national_id: 'TX-33491' } },
  { id: 'TAX-208', source: 'A', groundTruthId: 'CIV-08', fields: { given_name: 'mei-ling', surname: 'zhou', dob: '1992-04-30', gender: 'F', street: '2140 Wentworth Avenue', postal_code: '60616', national_id: 'TX-88342' } },
  { id: 'TAX-209', source: 'A', groundTruthId: 'CIV-09', fields: { given_name: 'nicholas', surname: 'papadopoulos', dob: '1963-08-06', gender: 'M', street: '610 Jackson Boulevard', postal_code: '60661', national_id: 'TX-12009' } },
  { id: 'TAX-210', source: 'A', groundTruthId: 'CIV-10', fields: { given_name: 'patricia', surname: 'henderson', dob: '1979-10-11', gender: 'F', street: '1508 Damen Avenue', postal_code: '60622', national_id: 'TX-49102' } },
];

const CIVIL_B: DatabaseRecord[] = [
  { id: 'VOT-801', source: 'B', groundTruthId: 'CIV-01', fields: { given_name: 'Alex', surname: 'Petrov', dob: '1977-03-14', gender: 'M', street: '1240 Elmhurst Ave', postal_code: '60614', national_id: '' } },
  { id: 'VOT-802', source: 'B', groundTruthId: 'CIV-02', fields: { given_name: 'Beatrice', surname: 'Fontaine', dob: '1983-08-07', gender: 'F', street: '55 Halsted St', postal_code: '60607', national_id: 'TX-55210' } },
  { id: 'VOT-803', source: 'B', groundTruthId: 'CIV-03', fields: { given_name: 'Chris', surname: 'Gallager', dob: '1968-11-22', gender: 'M', street: '809 Clark St #3', postal_code: '60610', national_id: '' } },
  { id: 'VOT-804', source: 'B', groundTruthId: 'CIV-04', fields: { given_name: 'Fatima', surname: 'Al Mansoor', dob: '1994-01-19', gender: 'F', street: '3020 Lincoln Ave', postal_code: '60657', national_id: 'TX-90122' } },
  { id: 'VOT-805', source: 'B', groundTruthId: 'CIV-05', fields: { given_name: 'Henrik', surname: 'Sorenson', dob: '1980-05-27', gender: 'M', street: '980 Diversey Pkwy', postal_code: '60614', national_id: '' } },
  { id: 'VOT-806', source: 'B', groundTruthId: 'CIV-06', fields: { given_name: 'Isabel', surname: 'Marchetti', dob: '1987-09-02', gender: 'F', street: '719 Taylor St', postal_code: '60607', national_id: '' } },
  { id: 'VOT-807', source: 'B', groundTruthId: 'CIV-07', fields: { given_name: 'Jerome', surname: 'Washington', dob: '1971-12-15', gender: 'M', street: '2250 Cottage Grove Avenue', postal_code: '60616', national_id: 'TX-33491' } },
  { id: 'VOT-808', source: 'B', groundTruthId: 'CIV-08', fields: { given_name: 'Meiling', surname: 'Zhou', dob: '1992-04-30', gender: 'F', street: '2140 S Wentworth Ave', postal_code: '60616', national_id: '' } },
  { id: 'VOT-809', source: 'B', groundTruthId: 'CIV-950', fields: { given_name: 'Nikos', surname: 'Papadakis', dob: '1963-08-06', gender: 'M', street: '610 W Jackson Blvd', postal_code: '60661', national_id: '' } },
  { id: 'VOT-810', source: 'B', groundTruthId: 'CIV-951', fields: { given_name: 'Patrick', surname: 'Henderson', dob: '1979-10-11', gender: 'M', street: '1508 Damen Ave', postal_code: '60622', national_id: '' } },
];

const FINANCE_A: DatabaseRecord[] = [
  { id: 'BNK-01', source: 'A', groundTruthId: 'FIN-01', fields: { given_name: 'Arthur', surname: 'Pendleton', dob: '1975-05-18', gender: 'M', street: '1400 Brickell Bay Dr', postal_code: '33131', national_id: 'AC-8821' } },
  { id: 'BNK-02', source: 'A', groundTruthId: 'FIN-02', fields: { given_name: 'Camila', surname: 'Mendoza', dob: '1989-02-14', gender: 'F', street: '742 Coral Way', postal_code: '33145', national_id: 'AC-4410' } },
  { id: 'BNK-03', source: 'A', groundTruthId: 'FIN-03', fields: { given_name: 'Edward', surname: 'Kaczmarek', dob: '1966-09-29', gender: 'M', street: '3315 Biscayne Blvd', postal_code: '33137', national_id: 'AC-1903' } },
  { id: 'BNK-04', source: 'A', groundTruthId: 'FIN-04', fields: { given_name: 'Miriam', surname: 'Goldberg', dob: '1982-12-07', gender: 'F', street: '920 Collins Avenue', postal_code: '33139', national_id: 'AC-5592' } },
  { id: 'BNK-05', source: 'A', groundTruthId: 'FIN-05', fields: { given_name: 'Tariq', surname: 'Al-Sayed', dob: '1991-06-24', gender: 'M', street: '110 Washington Ave', postal_code: '33139', national_id: 'AC-7704' } },
  { id: 'BNK-06', source: 'A', groundTruthId: 'FIN-06', fields: { given_name: 'Victoria', surname: 'Ashworth', dob: '1978-04-03', gender: 'F', street: '2800 Ponce De Leon Blvd', postal_code: '33134', national_id: 'AC-3120' } },
  { id: 'BNK-07', source: 'A', groundTruthId: 'FIN-07', fields: { given_name: 'Roberto', surname: 'Fernandez', dob: '1985-08-19', gender: 'M', street: '510 Flagler Street', postal_code: '33130', national_id: 'AC-6601' } },
  { id: 'BNK-08', source: 'A', groundTruthId: 'FIN-08', fields: { given_name: 'Grace', surname: 'Lindholm', dob: '1996-11-11', gender: 'F', street: '45 Alton Road', postal_code: '33139', national_id: 'AC-9055' } },
];

const FINANCE_B: DatabaseRecord[] = [
  { id: 'INS-501', source: 'B', groundTruthId: 'FIN-01', fields: { given_name: 'Arthur', surname: 'Pendelton', dob: '1975-05-18', gender: 'M', street: '1400 Brickell Bay Drive', postal_code: '33131', national_id: '' } },
  { id: 'INS-502', source: 'B', groundTruthId: 'FIN-02', fields: { given_name: 'Camilla', surname: 'Mendoza', dob: '1989-02-14', gender: 'F', street: '742 Coral Way', postal_code: '33145', national_id: 'AC-4410' } },
  { id: 'INS-503', source: 'B', groundTruthId: 'FIN-03', fields: { given_name: 'Ed', surname: 'Kaczmarek', dob: '1966-09-29', gender: 'M', street: '3315 Biscayne Boulevard', postal_code: '33137', national_id: '' } },
  { id: 'INS-504', source: 'B', groundTruthId: 'FIN-04', fields: { given_name: 'Miriam', surname: 'Goldberg', dob: '1982-07-12', gender: 'F', street: '920 Collins Ave', postal_code: '33139', national_id: '' } },
  { id: 'INS-505', source: 'B', groundTruthId: 'FIN-05', fields: { given_name: 'Tarik', surname: 'Alsayed', dob: '1991-06-24', gender: 'M', street: '110 Washington Avenue', postal_code: '33139', national_id: 'AC-7704' } },
  { id: 'INS-506', source: 'B', groundTruthId: 'FIN-910', fields: { given_name: 'Valerie', surname: 'Ashworth', dob: '1978-04-03', gender: 'F', street: '2800 Ponce De Leon Blvd', postal_code: '33134', national_id: '' } },
  { id: 'INS-507', source: 'B', groundTruthId: 'FIN-07', fields: { given_name: 'Roberto', surname: 'Fernandes', dob: '1985-08-19', gender: 'M', street: '510 W Flagler St', postal_code: '33130', national_id: '' } },
  { id: 'INS-508', source: 'B', groundTruthId: 'FIN-911', fields: { given_name: 'Daniel', surname: 'Lindholm', dob: '1996-11-11', gender: 'M', street: '45 Alton Rd', postal_code: '33139', national_id: '' } },
];

export const BENCHMARK_PRESETS: DatasetPreset[] = [
  {
    id: 'healthcare-ehr',
    name: 'Regional Healthcare Registries',
    domain: 'Clinical & Patient Master Index',
    dbAName: 'Regional Hospital EHR',
    dbBName: 'Municipal Clinic Network',
    description:
      '18 hospital EHR records vs 18 outpatient clinic records featuring OCR typos, phonetic variants, abbreviated street tokens, missing health IDs, and household twin traps.',
    recordsA: HEALTHCARE_A,
    recordsB: HEALTHCARE_B,
    fields: DEFAULT_PERSON_FIELDS,
    blockingRules: DEFAULT_PERSON_BLOCKING,
  },
  {
    id: 'civil-voter',
    name: 'Tax Roll vs. Electoral Registry',
    domain: 'Civil Identity & Public Administration',
    dbAName: 'Municipal Tax Roll',
    dbBName: 'Electoral Commission Roll',
    description:
      'Cross-agency linkage across municipal tax filings and voter registration rolls with casing differences, nicknames, and address relocations.',
    recordsA: CIVIL_A,
    recordsB: CIVIL_B,
    fields: DEFAULT_PERSON_FIELDS,
    blockingRules: DEFAULT_PERSON_BLOCKING,
  },
  {
    id: 'finance-crm',
    name: 'Retail Banking vs. Insurance Ledger',
    domain: 'Financial KYC & Underwriting',
    dbAName: 'Retail Banking Core',
    dbBName: 'Insurance Underwriting CRM',
    description:
      'Customer deduplication between banking core accounts and insurance policy ledgers with date transpositions and surname spelling drift.',
    recordsA: FINANCE_A,
    recordsB: FINANCE_B,
    fields: DEFAULT_PERSON_FIELDS,
    blockingRules: DEFAULT_PERSON_BLOCKING,
  },
];

// Deterministic PRNG for reproducible synthetic stress testing
function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Olivia', 'Liam', 'Sophia', 'Noah', 'Amara', 'Mateo', 'Clara', 'Julian',
  'Elena', 'Sebastian', 'Nadia', 'Benjamin', 'Hannah', 'Lucas', 'Priya',
  'Daniel', 'Rachel', 'Samuel', 'Claire', 'David', 'Fatima', 'Henrik',
  'Isabella', 'Jerome', 'Katherine', 'Marcus', 'Stephanie', 'Thomas',
];

const LAST_NAMES = [
  'Henderson', 'Kowalski', 'Alvarez', 'Mansour', 'Rostova', 'Keller',
  'Subramanian', 'Mercer', 'Lindqvist', 'Goldstein', 'Osei', 'Beaumont',
  'Haddad', 'Whitman', 'Fontaine', 'Gallagher', 'Sorensen', 'Marchetti',
  'Washington', 'Papadopoulos', 'Pendleton', 'Mendoza', 'Kaczmarek', 'Ashworth',
];

const STREETS = [
  'Oakwood Boulevard', 'Maple Ridge Road', 'Pinecrest Avenue', 'Cedar Lane',
  'Valencia Street', 'Market Street', 'Lombard Street', 'Hayes Street',
  'Chestnut Drive', 'Fulton Street', 'Divisadero Street', 'Bryant Street',
];

const STREET_ABBR: Record<string, string> = {
  Boulevard: 'Blvd',
  Road: 'Rd',
  Avenue: 'Ave',
  Lane: 'Ln',
  Street: 'St',
  Drive: 'Dr',
};

function corruptString(s: string, rand: () => number): string {
  if (s.length < 4) return s;
  const op = rand();
  const idx = 1 + Math.floor(rand() * (s.length - 2));
  if (op < 0.34) {
    // Adjacent character swap
    return s.slice(0, idx) + s[idx + 1] + s[idx] + s.slice(idx + 2);
  }
  if (op < 0.67) {
    // Drop a character
    return s.slice(0, idx) + s.slice(idx + 1);
  }
  // Substitute vowel
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const replacement = vowels[Math.floor(rand() * vowels.length)];
  return s.slice(0, idx) + replacement + s.slice(idx + 1);
}

export function generateSyntheticDataset(options: {
  sizePerDb: number;
  overlapRate: number;
  noiseRate: number;
  seed?: number;
}): {
  recordsA: DatabaseRecord[];
  recordsB: DatabaseRecord[];
  fields: FieldSchema[];
  blockingRules: BlockingRule[];
} {
  const { sizePerDb, overlapRate, noiseRate, seed = 2026 } = options;
  const rand = mulberry32(seed);

  const recordsA: DatabaseRecord[] = [];
  const recordsB: DatabaseRecord[] = [];

  const overlapCount = Math.round(sizePerDb * overlapRate);

  const makePerson = (idx: number) => {
    const given_name = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    const surname = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
    const year = 1955 + Math.floor(rand() * 45);
    const month = String(1 + Math.floor(rand() * 12)).padStart(2, '0');
    const day = String(1 + Math.floor(rand() * 28)).padStart(2, '0');
    const dob = `${year}-${month}-${day}`;
    const gender = rand() < 0.5 ? 'F' : 'M';
    const num = 10 + Math.floor(rand() * 1900);
    const st = STREETS[Math.floor(rand() * STREETS.length)];
    const postal_code = String(94100 + Math.floor(rand() * 35));
    const national_id = `ID-${10000 + idx}`;
    return {
      given_name,
      surname,
      dob,
      gender,
      street: `${num} ${st}`,
      postal_code,
      national_id,
    };
  };

  for (let i = 0; i < sizePerDb; i++) {
    const base = makePerson(i);
    const gt = `SYN-${String(i + 1).padStart(4, '0')}`;
    recordsA.push({
      id: `DBA-${String(i + 1).padStart(4, '0')}`,
      source: 'A',
      groundTruthId: gt,
      fields: base,
    });

    if (i < overlapCount) {
      const noisy = { ...base };
      if (rand() < noiseRate) noisy.given_name = corruptString(noisy.given_name, rand);
      if (rand() < noiseRate) noisy.surname = corruptString(noisy.surname, rand);
      if (rand() < noiseRate * 0.6) {
        const [y, m, d] = noisy.dob.split('-');
        noisy.dob = `${y}-${d}-${m}`;
      }
      if (rand() < noiseRate * 1.4) {
        for (const [full, abbr] of Object.entries(STREET_ABBR)) {
          noisy.street = noisy.street.replace(full, abbr);
        }
      }
      if (rand() < Math.min(0.85, noiseRate * 1.8)) {
        noisy.national_id = '';
      }
      recordsB.push({
        id: `DBB-${String(i + 1).padStart(4, '0')}`,
        source: 'B',
        groundTruthId: gt,
        fields: noisy,
      });
    }
  }

  for (let i = overlapCount; i < sizePerDb; i++) {
    const uniqueB = makePerson(sizePerDb + i);
    recordsB.push({
      id: `DBB-${String(i + 1).padStart(4, '0')}`,
      source: 'B',
      groundTruthId: `UNQ-${String(i + 1).padStart(4, '0')}`,
      fields: uniqueB,
    });
  }

  // Shuffle Database B so matching records aren't aligned by row index
  for (let i = recordsB.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [recordsB[i], recordsB[j]] = [recordsB[j], recordsB[i]];
  }

  return {
    recordsA,
    recordsB,
    fields: DEFAULT_PERSON_FIELDS,
    blockingRules: DEFAULT_PERSON_BLOCKING,
  };
}
