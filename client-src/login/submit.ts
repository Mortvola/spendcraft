type ErrorsType = {
  username?: string[],
  password?: string[],
  email?: string[],
  general?: string[],
}

const submitForm = async (
  event: React.MouseEvent | null,
  form: HTMLFormElement,
  url: string,
  success: ((data: string) => void),
  fail: ((errors: ErrorsType) => void),
) => {
  const formData = new FormData(form);
  const csrfTokenElement = document.querySelector('meta[name="csrf-token"]');

  if (csrfTokenElement === null) {
    throw new Error('CSRF Token element not found');
  }

  const csrfToken = csrfTokenElement.getAttribute('content');

  if (csrfToken === null) {
    throw new Error('CSRF Token not set');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-CSRF-TOKEN': csrfToken,
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
      fail(json.errors);
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
