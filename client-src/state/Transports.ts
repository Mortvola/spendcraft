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

export const patchJSON = async (url: string, body: unknown): Promise<Response> => {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });

  await checkResponse(response);

  return response;
}

export const postJSON = async (url: string, body: unknown): Promise<Response> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });

  await checkResponse(response);

  return response;
}

export const putJSON = async (url: string, body: unknown): Promise<Response> => {
  const response = await fetch(url, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });

  await checkResponse(response);

  return response;
}

export const httpGet = async (url: string): Promise<Response> => {
  const response = await fetch(url, {
    method: 'GET',
    headers: defaultHeaders(),
  });

  await checkResponse(response);

  return response;
}

export const httpDelete = async (url: string): Promise<Response> => {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: defaultHeaders(),
  });

  await checkResponse(response);

  return response;
}

export const httpPost = async (url: string): Promise<Response> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: defaultHeaders(),
  });

  await checkResponse(response);

  return response;
}
