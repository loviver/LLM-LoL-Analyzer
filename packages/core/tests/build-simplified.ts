import fs from 'fs';

import { DPM } from '../src/api/DPM';

async function main() {
  const dpm = new DPM();

  const build = await dpm.getBuild('Kayn', 'jungle', 'silver', 15.5);
  const simplified = dpm.buildSimplified(build, 'top');
  
  fs.writeFileSync('simplified-build.json', JSON.stringify(simplified, null, 2));

  console.log(simplified);
}

main();