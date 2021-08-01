type ErrorsType = Record<string, string[]>;

const submitForm = async (
  event: React.MouseEvent | null,
  form: HTMLFormElement,
  url: string,
  success: ((data: string) => void),
  fail: ((errors: ErrorsType) => void),
): Promise<void> => {
  const formData = new FormData(form);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: formData,
  });

  if (response.ok) {
    if (response.headers.get('Content-Type') === 'application/json') {
      const json = await response.json();
      success(json);
    }
  }
  else if (fail) {
    if (response.status === 422) {
      const json = await response.json();
      const errors: Record<string, string[]> = {};
      json.errors.forEach((error: { rule: string, field: string, message: string }) => {
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
