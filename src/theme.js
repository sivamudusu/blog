// Theme toggle functionality
function initTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'light' ? '🌙' : '☀️';
  }
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const currentTheme = document.documentElement.getAttribute('data-theme');
  updateThemeIcon(currentTheme);
});

// Setup theme toggle button
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}
