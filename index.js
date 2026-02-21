const express = require('express');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

function findRecipeInLinkedData(jsonLdArray) {
  for (const item of jsonLdArray) {
    if (item['@type'] === 'Recipe') return item;
    if (Array.isArray(item['@type']) && item['@type'].includes('Recipe')) return item;
    if (item['@graph'] && Array.isArray(item['@graph'])) {
      const found = item['@graph'].find(
        (g) =>
          g['@type'] === 'Recipe' ||
          (Array.isArray(g['@type']) && g['@type'].includes('Recipe'))
      );
      if (found) return found;
    }
  }
  return null;
}

function parseInstructions(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];

  const steps = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      steps.push(item.trim());
    } else if (item['@type'] === 'HowToStep') {
      steps.push((item.text || '').trim());
    } else if (item['@type'] === 'HowToSection') {
      const sectionSteps = item.itemListElement || [];
      for (const s of sectionSteps) {
        if (typeof s === 'string') {
          steps.push(s.trim());
        } else {
          steps.push((s.text || '').trim());
        }
      }
    }
  }
  return steps.filter(Boolean);
}

function stripHtml(text) {
  return cheerio.load(`<span>${text}</span>`)('span').text().trim();
}

function extractFromJsonLd($) {
  const scripts = $('script[type="application/ld+json"]');
  const jsonLdItems = [];

  scripts.each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html());
      if (Array.isArray(parsed)) {
        jsonLdItems.push(...parsed);
      } else {
        jsonLdItems.push(parsed);
      }
    } catch {}
  });

  const recipe = findRecipeInLinkedData(jsonLdItems);
  if (!recipe) return null;

  const ingredients = (recipe.recipeIngredient || []).map((i) => stripHtml(i));
  const instructions = parseInstructions(recipe.recipeInstructions).map((i) =>
    stripHtml(i)
  );

  return {
    title: stripHtml(recipe.name || ''),
    image: Array.isArray(recipe.image)
      ? recipe.image[0]
      : typeof recipe.image === 'object'
        ? recipe.image.url
        : recipe.image || null,
    yield: recipe.recipeYield
      ? Array.isArray(recipe.recipeYield)
        ? recipe.recipeYield[0]
        : recipe.recipeYield
      : null,
    totalTime: recipe.totalTime || null,
    ingredients,
    instructions,
  };
}

function extractFromMicrodata($) {
  const recipeEl = $('[itemtype*="schema.org/Recipe"]');
  if (!recipeEl.length) return null;

  const title =
    recipeEl.find('[itemprop="name"]').first().text().trim() || '';
  const ingredients = [];
  recipeEl.find('[itemprop="recipeIngredient"], [itemprop="ingredients"]').each(
    (_, el) => {
      const text = $(el).text().trim();
      if (text) ingredients.push(text);
    }
  );

  const instructions = [];
  recipeEl.find('[itemprop="recipeInstructions"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text) instructions.push(text);
  });

  if (!ingredients.length && !instructions.length) return null;

  return {
    title,
    image: recipeEl.find('[itemprop="image"]').attr('src') || null,
    yield: recipeEl.find('[itemprop="recipeYield"]').text().trim() || null,
    totalTime: null,
    ingredients,
    instructions,
  };
}

app.get('/api/recipe', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; RecipeStripper/1.0)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      return res
        .status(502)
        .json({ error: `Failed to fetch page (HTTP ${response.status})` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let recipe = extractFromJsonLd($);
    if (!recipe) {
      recipe = extractFromMicrodata($);
    }

    if (!recipe || (!recipe.ingredients.length && !recipe.instructions.length)) {
      return res
        .status(404)
        .json({ error: 'No recipe data found on this page' });
    }

    recipe.source = url;
    res.json(recipe);
  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch or parse the page' });
  }
});

app.listen(PORT, () => {
  console.log(`Recipe Stripper running at http://localhost:${PORT}`);
});
