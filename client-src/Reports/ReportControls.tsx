import React, { ReactElement, ReactNode } from 'react';
import { Form } from 'formik';
import styles from './ReportControls.module.css'

type PropsType = {
  children: ReactNode,
}

const ReportControls = ({
  children,
}: PropsType): ReactElement => (
  <Form className={styles.reportControls}>
    {children}
  </Form>
)

export default ReportControls;
