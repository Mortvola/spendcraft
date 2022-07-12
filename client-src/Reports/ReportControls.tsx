import React, { ReactNode } from 'react';
import { Form } from 'formik';
import styles from './ReportControls.module.css'

type PropsType = {
  children?: ReactNode,
}

const ReportControls: React.FC<PropsType> = ({
  children,
}) => (
  <Form className={styles.reportControls}>
    {children}
  </Form>
)

export default ReportControls;
