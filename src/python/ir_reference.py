"""Approximate mid-IR absorption ranges in cm^-1, for candidate assignments.

Each signature band is (name, low, high, expected strength). Frequencies shift
with phase, substitution, conjugation, hydrogen bonding and measurement method.
The intervals are broad screening windows, not molecular identification.

Reference: NIST, Middle-Range Infrared Absorption Correlation Charts (2012),
https://www.nist.gov/publications/middle-range-infrared-absorption-correlation-charts
See also measured spectra at https://webbook.nist.gov/chemistry/.
"""

# A group requires all listed diagnostic bands unless MIN_BANDS overrides it.
BANDS = {
    'Alcohol': [('O–H', 3200, 3650, 'strong'), ('C–O', 1000, 1260, 'strong')],
    'Phenol': [('O–H', 3200, 3650, 'strong'), ('C–O', 1150, 1300, 'strong')],
    'Carboxylic acid': [('O–H', 2500, 3300, 'strong'), ('C=O', 1680, 1760, 'strong')],
    'Primary amine': [('N–H asymmetric', 3370, 3550, 'medium'),
                      ('N–H symmetric', 3250, 3420, 'medium'),
                      ('N–H bend', 1550, 1650, 'medium')],
    'Secondary amine': [('N–H', 3250, 3450, 'medium'), ('C–N', 1020, 1350, 'medium')],
    'Tertiary amine': [('C–N', 1020, 1350, 'medium')],
    'Primary amide': [('N–H asymmetric', 3350, 3550, 'medium'),
                      ('N–H symmetric', 3180, 3400, 'medium'),
                      ('Amide I C=O', 1630, 1700, 'strong'),
                      ('Amide II', 1510, 1600, 'medium')],
    'Secondary amide': [('N–H', 3150, 3500, 'medium'),
                        ('Amide I C=O', 1630, 1700, 'strong'),
                        ('Amide II', 1500, 1600, 'medium')],
    'Tertiary amide': [('Amide I C=O', 1630, 1700, 'strong'), ('C–N', 1200, 1400, 'medium')],
    'Urea': [('C=O', 1630, 1720, 'strong'), ('N–H', 3180, 3500, 'medium')],
    'Carbamate': [('C=O', 1690, 1760, 'strong'), ('C–O', 1050, 1300, 'strong'),
                 ('N–H', 3200, 3500, 'medium')],
    'Ester': [('C=O', 1715, 1760, 'strong'), ('C–O high', 1170, 1300, 'strong'),
              ('C–O low', 1000, 1170, 'strong')],
    'Lactone': [('C=O', 1730, 1810, 'strong'), ('C–O', 1050, 1300, 'strong')],
    'Carbonate': [('C=O', 1740, 1810, 'strong'), ('C–O', 1050, 1300, 'strong')],
    'Acid anhydride': [('C=O asymmetric', 1790, 1850, 'strong'),
                       ('C=O symmetric', 1730, 1800, 'strong'),
                       ('C–O', 900, 1300, 'strong')],
    'Acyl chloride': [('C=O', 1770, 1830, 'strong'), ('C–Cl', 550, 800, 'medium')],
    'Aldehyde': [('C=O', 1680, 1750, 'strong'), ('C–H 1', 2800, 2860, 'weak'),
                  ('C–H 2', 2680, 2760, 'weak')],
    'Ketone': [('C=O', 1680, 1740, 'strong')],
    'Quinone': [('C=O', 1630, 1700, 'strong'), ('C=C', 1570, 1650, 'medium')],
    'Ether': [('C–O–C', 1020, 1270, 'strong')],
    'Epoxide': [('ring C–O', 800, 950, 'medium'), ('C–O', 1200, 1280, 'medium')],
    'Alkane': [('sp3 C–H', 2850, 3000, 'medium'), ('CH2/CH3 bend', 1350, 1490, 'medium')],
    'Alkene': [('sp2 C–H', 3000, 3150, 'medium'), ('C=C', 1600, 1680, 'medium')],
    'Alkyne': [('C≡C', 2100, 2260, 'weak'), ('terminal ≡C–H', 3260, 3350, 'strong')],
    'Aromatic ring': [('aromatic C–H', 3000, 3150, 'medium'),
                       ('ring C=C high', 1570, 1630, 'medium'),
                       ('ring C=C low', 1450, 1540, 'medium')],
    'Nitrile': [('C≡N', 2210, 2280, 'medium')],
    'Isocyanate': [('N=C=O', 2230, 2300, 'strong')],
    'Isothiocyanate': [('N=C=S', 2000, 2150, 'strong')],
    'Imine': [('C=N', 1630, 1700, 'medium')],
    'Nitro': [('NO2 asymmetric', 1500, 1570, 'strong'),
              ('NO2 symmetric', 1300, 1390, 'strong')],
    'Nitrate ester': [('NO2 asymmetric', 1600, 1680, 'strong'),
                      ('NO2 symmetric', 1250, 1350, 'strong')],
    'Sulfone': [('SO2 asymmetric', 1280, 1360, 'strong'),
                ('SO2 symmetric', 1100, 1180, 'strong')],
    'Sulfonamide': [('SO2 asymmetric', 1300, 1380, 'strong'),
                    ('SO2 symmetric', 1120, 1180, 'strong'),
                    ('N–H', 3200, 3450, 'medium')],
    'Sulfonic acid': [('S=O', 1030, 1220, 'strong'), ('O–H', 2500, 3500, 'strong')],
    'Sulfoxide': [('S=O', 1020, 1100, 'strong')],
    'Thiol': [('S–H', 2530, 2600, 'weak')],
    'Thioether': [('C–S', 600, 750, 'weak')],
    'Disulfide': [('S–S', 450, 550, 'weak')],
    'Phosphate ester': [('P=O', 1200, 1300, 'strong'), ('P–O–C', 950, 1100, 'strong')],
    'Phosphonate': [('P=O', 1150, 1300, 'strong'), ('P–O', 900, 1100, 'strong')],
    'Siloxane': [('Si–O–Si', 1000, 1130, 'strong'), ('Si–C', 750, 860, 'medium')],
    'Organosilane': [('Si–H', 2100, 2250, 'medium')],
    'Fluoroalkane': [('C–F', 1000, 1400, 'strong')],
    'Chloroalkane': [('C–Cl', 600, 800, 'medium')],
    'Bromoalkane': [('C–Br', 500, 650, 'medium')],
    'Iodoalkane': [('C–I', 450, 550, 'medium')],
    'Azo': [('N=N', 1400, 1500, 'medium')],
    'Peroxide': [('O–O', 800, 900, 'weak')],
}

MIN_BANDS = {
    'Primary amine': 2,
    'Primary amide': 3,
    'Secondary amide': 2,
    'Carbamate': 2,
    'Aldehyde': 2,
    'Aromatic ring': 2,
    'Acid anhydride': 2,
}

# One isolated fingerprint band rarely identifies a group uniquely.
LOW_SPECIFICITY = {
    'Tertiary amine', 'Ketone', 'Ether', 'Thioether', 'Disulfide',
    'Fluoroalkane', 'Chloroalkane', 'Bromoalkane', 'Iodoalkane',
    'Imine', 'Azo', 'Peroxide',
}
