import HttpResponse from './HttpResponse';

class Http {
  static defaultHeaders(): Headers {
    const headers = new Headers({
      Accept: 'application/json',
    });

    return headers;
  }

  static jsonHeaders(): Headers {
    const headers = Http.defaultHeaders();

    headers.append('Content-Type', 'application/json');

    return headers;
  }

  static async fetch(url: string, options?: RequestInit): Promise<HttpResponse> {
    const res = await fetch(url, options);

    const response = new HttpResponse(res);

    await response.check();

    return response;
  }

  static async patch (url: string, body: unknown): Promise<HttpResponse> {
    return (
      Http.fetch(url, {
        method: 'PATCH',
        headers: Http.jsonHeaders(),
        body: JSON.stringify(body),
      })
    )
  }

  static async put(url: string, body: unknown): Promise<HttpResponse> {
    return (
      Http.fetch(url, {
        method: 'PUT',
        headers: Http.jsonHeaders(),
        body: JSON.stringify(body),
      })
    )
  }

  static async get(url: string): Promise<HttpResponse> {
    return (
      Http.fetch(url, {
        method: 'GET',
        headers: Http.defaultHeaders(),
      })
    )
  }

  static async delete(url: string): Promise<HttpResponse> {
    return (
      Http.fetch(url, {
        method: 'DELETE',
        headers: Http.defaultHeaders(),
      })
    )
  }

  static async post(url: string, body?: unknown): Promise<HttpResponse> {
    if (body === undefined) {
      return Http.fetch(url, {
        method: 'POST',
        headers: Http.defaultHeaders(),
      });
    }

    return Http.fetch(url, {
      method: 'POST',
      headers: Http.jsonHeaders(),
      body: JSON.stringify(body),
    });
  }

  static async postForm(url: string, form: FormData): Promise<HttpResponse> {
    return (
      Http.fetch(url, {
        method: 'POST',
        headers: Http.jsonHeaders(),
        body: form,
      })
    )
  }
}

export default Http;
