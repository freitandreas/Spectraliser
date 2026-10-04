import json
import tempfile
import unittest
from pathlib import Path

from sample_io import load_sample_dataframe, sample_data_path


class SampleIoTests(unittest.TestCase):
    def test_prefers_exported_data_file_relative_to_project(self):
        meta = {'sourcePath': 'original.csv', 'dataFile': 'data/a.csv'}
        self.assertEqual(sample_data_path(meta, '/project'), Path('/project/data/a.csv'))
        self.assertEqual(sample_data_path({'sourcePath': 'original.csv'}), Path('original.csv'))

    def test_loads_exported_csv_and_samples_json(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            (root / 'data' / 'a.csv').write_text('Wavelength / nm,Absorbance\n200,0.1\n201,0.2\n')
            samples = [{'name': 'a', 'sourcePath': 'missing.csv', 'dataFile': 'data/a.csv'}]
            (root / 'samples.json').write_text(json.dumps(samples))
            meta = json.loads((root / 'samples.json').read_text())[0]
            frame = load_sample_dataframe(meta, root)
            self.assertEqual(list(frame.iloc[:, 0]), [200, 201])


if __name__ == '__main__':
    unittest.main()
