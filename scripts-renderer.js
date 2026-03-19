/**
 * Shared script renderer for makethings.audio
 * Fetches /data/scripts.json and renders a platform's scripts into the page.
 */
function renderScripts(platformKey) {
  const container = document.getElementById('scripts-container');
  if (!container) return;

  fetch('/data/scripts.json')
    .then(r => {
      if (!r.ok) throw new Error('Failed to load scripts data');
      return r.json();
    })
    .then(data => {
      const platform = data[platformKey];
      if (!platform) {
        container.innerHTML = '<p>No scripts found.</p>';
        return;
      }

      let html = '';

      // Featured tools
      if (platform.featured && platform.featured.length > 0) {
        html += '<section class="script-section"><h2>Tools</h2><div class="tools-grid">';
        for (const tool of platform.featured) {
          html += `<a href="${esc(tool.url)}" class="tool-card">` +
            `<h3>${esc(tool.name)}</h3>` +
            `<p>${esc(tool.description)}</p></a>`;
        }
        html += '</div></section>';
      }

      // Categories
      for (const category of platform.categories) {
        html += `<section class="script-section"><h2>${esc(category.name)}</h2>` +
          '<ul class="script-list">';
        for (const script of category.scripts) {
          html += `<li><a href="${esc(script.url)}">` +
            `<span class="script-name">${esc(script.name)}</span>` +
            `<span class="script-type">${esc(script.type)}</span>` +
            '</a></li>';
        }
        html += '</ul></section>';
      }

      container.innerHTML = html;
    })
    .catch(err => {
      console.error('Error loading scripts:', err);
      container.innerHTML = '<p>Unable to load scripts. Please try again later.</p>';
    });
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}
