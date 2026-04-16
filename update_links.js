const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/aaron/dev/landingpage';

// 1. Append CSS
const teamCss = fs.readFileSync(path.join(dir, 'team_styles.css'), 'utf8');
fs.appendFileSync(path.join(dir, 'style.css'), '\n' + teamCss);
console.log('Appended team_styles.css to style.css');

// 2. Replace links in HTML files
const files = ['index.html', 'contact.html', 'docs.html', 'dev-process.html'];
files.forEach(file => {
  const filePath = path.join(dir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    if (content.includes('href="#team-section"')) {
      content = content.replace(/href="#team-section"/g, 'href="team.html"');
      changed = true;
    }
    
    // docs.html might not have a team link in nav at all, let's insert it if missing.
    if (file === 'docs.html' && !content.includes('team.html')) {
        content = content.replace(
            '<a href="docs.html">docs</a>\n        <a href="dev-process.html">dev process</a>',
            '<a href="docs.html">docs</a>\n        <a href="team.html">team</a>\n        <a href="dev-process.html">dev process</a>'
        );
        changed = true;
    }
    
    // dev-process.html might also miss team link
    if (file === 'dev-process.html' && !content.includes('team.html')) {
        content = content.replace(
            '<a href="dev-process.html">dev process</a>\n        <a href="contact.html">contact</a>',
            '<a href="team.html">team</a>\n        <a href="dev-process.html">dev process</a>\n        <a href="contact.html">contact</a>'
        );
        changed = true;
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated links in ${file}`);
    }
  }
});
