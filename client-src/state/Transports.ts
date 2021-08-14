const defaultHeaders = () => {
  const headers = new Headers({
    Accept: 'application/json',
  });

  return headers;
};

const jsonHeaders = () => {
  const headers = defaultHeaders();

  headers.append('Content-Type', 'application/json');

  return headers;
};

export const getBody = async (response: Response): Promise<unknown> => {
  try {
    const contentType = response.headers.get('Content-Type');
    if (contentType && /^application\/json/.test(contentType)) {
      return response.json();
    }
  }
  catch (error) {
    console.log(error);
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

export const httpGet = (url: string): Promise<Response> => (
  fetch(url, {
    method: 'GET',
    headers: defaultHeaders(),
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
