import { isRouteNotFound, isServerErrorResponse, serverError } from './ServerError';

class HttpResponse {
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

export default HttpResponse;
