// A tiny router: method + path pattern (with :params) -> handler.
// Example: router.add('GET', '/api/events/:id', handler)

export function createRouter() {
  const routes = [];

  return {
    // Register a route. The pattern is split into segments once, up front.
    add(method, pattern, handler) {
      routes.push({ method: method.toUpperCase(), segments: split(pattern), handler });
    },

    // Find the first route that matches. Returns { handler, params } or null.
    match(method, path) {
      const parts = split(path);
      for (const route of routes) {
        if (route.method !== method.toUpperCase()) continue;
        const params = matchSegments(route.segments, parts);
        if (params) return { handler: route.handler, params };
      }
      return null;
    },
  };
}

// "/api/events/" -> ["api", "events"]  (ignores empty pieces)
function split(path) {
  return path.split('/').filter((piece) => piece !== '');
}

function matchSegments(patternParts, pathParts) {
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const want = patternParts[i];
    const got = pathParts[i];
    if (want.startsWith(':')) {
      try {
        params[want.slice(1)] = decodeURIComponent(got); // %20 -> space
      } catch {
        return null; // malformed % sequence: treat as "no match"
      }
    } else if (want !== got) {
      return null;
    }
  }
  return params;
}
