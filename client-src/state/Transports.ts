const defaultHeaders = () => {
  const headers = new Headers();
  const csrfMetaValue = document.querySelector('meta[name="csrf-token"]');
  if (csrfMetaValue) {
    const csrfToken = csrfMetaValue.getAttribute('content');
    if (csrfToken) {
      headers.append('X-CSRF-TOKEN', csrfToken);
    }
  }

  return headers;
};

const jsonHeaders = () => {
  const headers = defaultHeaders();

  headers.append('Content-Type', 'application/json');

  return headers;
};

export const getBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get('Content-Type');
  if (contentType && /^application\/json/.test(contentType)) {
    return response.json();
  }

  return null;
};

export const patchJSON = (url: string, body: unknown): Promise<Response> => (
  fetch(url, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })
);

export const postJSON = (url: string, body: unknown): Promise<Response> => (
  fetch(url, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })
);

export const putJSON = (url: string, body: unknown): Promise<Response> => (
  fetch(url, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })
);

export const httpDelete = (url: string): Promise<Response> => (
  fetch(url, {
    method: 'DELETE',
    headers: defaultHeaders(),
  })
);

export const httpPost = (url: string): Promise<Response> => (
  fetch(url, {
    method: 'POST',
    headers: defaultHeaders(),
  })
);
