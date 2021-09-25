import { isRouteNotFound, isServerErrorResponse, serverError } from './ServerError';

export class HttpResponse {
  fetchedBody: unknown | null = null;

  response: Response;

  constructor(response: Response) {
    this.response = response;
  }

  get ok(): boolean {
    return this.response.ok;
  }

  get headers(): Headers {
    return this.response.headers;
  }

  get status(): number {
    return this.response.status;
  }

  async json (): Promise<any> {
    return this.body();
  }

  async body (): Promise<unknown> {
    if (this.fetchedBody !== null) {
      return this.fetchedBody;
    }

    try {
      const contentType = this.response.headers.get('Content-Type');
      if (contentType && /^application\/json/.test(contentType)) {
        this.fetchedBody = this.response.json();
      }
    }
    catch (error) {
      console.log(error);
    }

    return this.fetchedBody;
  }

  async check (): Promise<void> {
    if (!this.response.ok) {
      const responseBody = await this.body();

      if (this.response.status >= 500) {
        if (isServerErrorResponse(responseBody)) {
          serverError.setError(responseBody);
          throw new Error('server error');
        }
      }
      else if (this.response.status === 401) {
        // If the user is not authorized, then send them 
        // back to the signin page.
        window.location.replace('/signin');
      }
      else if (this.response.status === 404) {
        if (isRouteNotFound(responseBody)) {
          serverError.setError(responseBody);
          throw new Error('server error');
        }
      }
    }
  }
}

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

const httpFetch = async (url: string, options?: RequestInit): Promise<HttpResponse> => {
  const res = await fetch(url, options);

  const response = new HttpResponse(res);

  await response.check();

  return response;
}

export const httpPatch = async (url: string, body: unknown): Promise<HttpResponse> => (
  httpFetch(url, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })
)

export const httpPut = async (url: string, body: unknown): Promise<HttpResponse> => (
  httpFetch(url, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })
)

export const httpGet = async (url: string): Promise<HttpResponse> => (
  httpFetch(url, {
    method: 'GET',
    headers: defaultHeaders(),
  })
)

export const httpDelete = async (url: string): Promise<HttpResponse> => (
  httpFetch(url, {
    method: 'DELETE',
    headers: defaultHeaders(),
  })
)

export const httpPost = async (url: string, body?: unknown): Promise<HttpResponse> => {
  if (body === undefined) {
    return httpFetch(url, {
      method: 'POST',
      headers: defaultHeaders(),
    });
  }

  return httpFetch(url, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

export const httpPostForm = async (url: string, form: FormData): Promise<HttpResponse> => (
  httpFetch(url, {
    method: 'POST',
    headers: jsonHeaders(),
    body: form,
  })
)
