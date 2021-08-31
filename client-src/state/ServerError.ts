import { makeAutoObservable, runInAction } from 'mobx';
import { createContext } from 'react';

type ServerErrorResponse = {
  message: string;
  stack: string;
};

export const isServerErrorResponse = (r: unknown): r is ServerErrorResponse => (
  (r as ServerErrorResponse).message !== undefined
  && (r as ServerErrorResponse).stack !== undefined
);

type RouteNotFound = {
  code: string,
  message: string,
  stack: string,
};

export const isRouteNotFound = (r: unknown): r is RouteNotFound => (
  (r as RouteNotFound).code !== undefined
  && (r as RouteNotFound).code === 'E_ROUTE_NOT_FOUND'
  && (r as RouteNotFound).message !== undefined
  && (r as RouteNotFound).stack !== undefined
);

class ServerError {
  message: string | null = null;

  stack: string[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  setError (error: ServerErrorResponse): void {
    runInAction(() => {
      const stack = error.stack.split('\n');
      [this.message, ...this.stack] = stack;
    });
  }
}

const serverError = new ServerError();

const ErrorStore = createContext(serverError);

export default ErrorStore;
export { serverError };
