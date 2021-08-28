import { isRouteNotFound, isServerErrorResponse, serverError } from './ServerError';

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

const checkResponse = async (response: Response) => {
  if (!response.ok) {
    const responseBody = await getBody(response);

    if (response.status >= 500) {
      if (isServerErrorResponse(responseBody)) {
        serverError.setError(responseBody);
        throw new Error('server error');
      }
    }
    else if (response.status === 404) {
      if (isRouteNotFound(responseBody)) {
        serverError.setError(responseBody);
        throw new Error('server error');
      }
    }
  }
}

const httpFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  const response = await fetch(url, options);

  await checkResponse(response);

  return response;
}

export const patchJSON = async (url: string, body: unknown): Promise<Response> => (
  httpFetch(url, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })
)

export const postJSON = async (url: string, body: unknown): Promise<Response> => (
  httpFetch(url, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })
)

export const putJSON = async (url: string, body: unknown): Promise<Response> => (
  httpFetch(url, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })
)

export const httpGet = async (url: string): Promise<Response> => (
  httpFetch(url, {
    method: 'GET',
    headers: defaultHeaders(),
  })
)

export const httpDelete = async (url: string): Promise<Response> => (
  httpFetch(url, {
    method: 'DELETE',
    headers: defaultHeaders(),
  })
)

export const httpPost = async (url: string): Promise<Response> => (
  httpFetch(url, {
    method: 'POST',
    headers: defaultHeaders(),
  })
)
