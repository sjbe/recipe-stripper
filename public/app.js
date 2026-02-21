const form = document.getElementById('recipe-form');
const urlInput = document.getElementById('url-input');
const submitBtn = document.getElementById('submit-btn');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const resultEl = document.getElementById('result');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  loadingEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  submitBtn.disabled = true;

  try {
    const res = await fetch(`/api/recipe?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    renderRecipe(data);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    loadingEl.classList.add('hidden');
    submitBtn.disabled = false;
  }
});

function formatTime(iso) {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}m`;
  return null;
}

function renderRecipe(recipe) {
  document.getElementById('recipe-title').textContent = recipe.title || 'Recipe';

  const imageEl = document.getElementById('recipe-image');
  if (recipe.image) {
    imageEl.src = recipe.image;
    imageEl.classList.remove('hidden');
  } else {
    imageEl.classList.add('hidden');
  }

  const metaEl = document.getElementById('recipe-meta');
  const metaParts = [];
  if (recipe.yield) metaParts.push(`Serves: ${recipe.yield}`);
  const time = formatTime(recipe.totalTime);
  if (time) metaParts.push(`Time: ${time}`);
  metaEl.textContent = metaParts.join(' \u2022 ');

  const ingredientsList = document.getElementById('ingredients-list');
  ingredientsList.innerHTML = '';
  for (const ing of recipe.ingredients) {
    const li = document.createElement('li');
    li.textContent = ing;
    ingredientsList.appendChild(li);
  }

  const instructionsList = document.getElementById('instructions-list');
  instructionsList.innerHTML = '';
  for (const step of recipe.instructions) {
    const li = document.createElement('li');
    li.textContent = step;
    instructionsList.appendChild(li);
  }

  const sourceLink = document.getElementById('source-link');
  try {
    const hostname = new URL(recipe.source).hostname;
    sourceLink.textContent = hostname;
  } catch {
    sourceLink.textContent = recipe.source;
  }
  sourceLink.href = recipe.source;

  resultEl.classList.remove('hidden');
}
