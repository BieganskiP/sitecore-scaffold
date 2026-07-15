export const LAYOUT_QUERY = `query GetLayout($site: String!, $routePath: String!, $language: String!) {
  layout(site: $site, routePath: $routePath, language: $language) {
    item { rendered }
  }
}`;

export const DICTIONARY_QUERY = `query GetDictionary($site: String!, $language: String!, $after: String) {
  site {
    siteInfo(site: $site) {
      dictionary(language: $language, first: 1000, after: $after) {
        results { key value }
        pageInfo { endCursor hasNext }
      }
    }
  }
}`;

export const ROUTES_QUERY = `query GetRoutes($site: String!, $language: String!, $after: String) {
  site {
    siteInfo(site: $site) {
      routes(language: $language, first: 100, after: $after) {
        results {
          routePath
          route {
            name
            updated: field(name: "__Updated") { value }
          }
        }
        pageInfo { endCursor hasNext }
      }
    }
  }
}`;

// Smaller page size: each route carries its full rendered layout JSON.
export const ROUTES_WITH_COMPONENTS_QUERY = `query GetRoutesWithComponents($site: String!, $language: String!, $after: String) {
  site {
    siteInfo(site: $site) {
      routes(language: $language, first: 25, after: $after) {
        results {
          routePath
          route {
            name
            updated: field(name: "__Updated") { value }
            rendered
          }
        }
        pageInfo { endCursor hasNext }
      }
    }
  }
}`;
