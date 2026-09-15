import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const domains = [
  "salesforce.com",
  "shopify.com",
  "quickbooks.intuit.com",
  "hubspot.com",
  "zendesk.com",
  "atlassian.com",
  "slack.com",
  "stripe.com",
  "contaazul.com",
  "omie.com.br",
  "vtex.com",
  "nuvemshop.com.br",
  "tiny.com.br",
  "rdstation.com"
];

const downloadLogo = async (domain) => {
  const url = `https://api.companyenrich.com/logo/${domain}`;
  const targetDir = path.join(__dirname, '../public/logos');
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = path.join(targetDir, `${domain}.png`);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download ${domain}: ${response.statusText}`);
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(targetPath, Buffer.from(buffer));
    console.log(`✓ Downloaded: ${domain}`);
  } catch (error) {
    console.error(`✗ Error downloading ${domain}:`, error.message);
  }
};

const run = async () => {
  console.log('Starting logo downloads...');
  for (const domain of domains) {
    await downloadLogo(domain);
  }
  console.log('Done!');
};

run();
