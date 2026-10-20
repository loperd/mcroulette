"""Export the authored district scene through the existing wide scene pipeline."""
import runpy
from pathlib import Path
result=runpy.run_path(str(Path(__file__).with_name('export-miner-wide-runtime.py')),init_globals={'CITADEL_EXPORT_STAGES':['C']})
RESULT=result['RESULT']
