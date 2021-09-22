import { httpPost } from '../State/Transports';

type ErrorsType = Record<string, string[]>;

const submitForm = async (
  event: React.MouseEvent | null,
  form: HTMLFormElement,
  url: string,
  success: ((data: string) => void),
  fail: ((errors: ErrorsType) => void),
): Promise<void> => {
  const formData = new FormData(form);
  const formBody: Record<string, unknown> = {};

  // eslint-disable-next-line no-restricted-syntax
  for (const pair of formData.entries()) {
    [, formBody[pair[0]]] = pair;
  }

  const response = await httpPost(url, formBody);

  if (response.ok) {
    if (response.headers.get('Content-Type') === 'application/json') {
      const body = await response.body();
      if (typeof body !== 'string') {
        throw new Error('response body is not a string');
      }

      success(body);
    }
  }
  else if (fail) {
    if (response.status === 422) {
      const body = await response.json();
      const errors: Record<string, string[]> = {};
      body.errors.forEach((error: { rule: string, field: string, message: string }) => {
        if (errors[error.field] === undefined) {
          errors[error.field] = [];
        }

        errors[error.field] = errors[error.field].concat(error.message);
      });
      fail(errors);
    }
    else {
      fail({ general: ['An error occured. Please try again later.'] });
    }
  }

  const e = event;
  if (e !== null) {
    e.preventDefault();
  }
};

const defaultErrors: ErrorsType = {
  username: [],
  password: [],
  email: [],
  general: [],
};

export { submitForm, ErrorsType, defaultErrors };
