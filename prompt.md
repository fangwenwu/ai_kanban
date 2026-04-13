请你帮我建立几张表格数据：
医生表(doctor)
字段：
id：医生ID，主键，自增
name：医生姓名
title：医生职称
department：医生所属科室
phone：医生联系电话
email：医生联系邮箱
address：医生联系地址

医生任务表(doctor_task)
字段：
id：医生任务ID，主键，自增
doctor_id：医生ID，外键，引用医生表(id)
task_name：任务名称
task_description：任务描述
task_start_time：任务开始时间
task_end_time：任务结束时间
represent_ids：联系医生的代表人员ID，外键，引用医生表(id)，多个代表人员ID用逗号分隔

代表人员表(represent)
字段：
id：代表人员ID，主键，自增
name：代表人员姓名
phone：代表人员联系电话
email：代表人员联系邮箱
address：代表人员联系地址
represent_ids：代表人员管理的医生ID，外键，引用医生表(id)，多个医生ID用逗号分隔

10个代表人员，每个代表人员管理30个医生，每个医生可以被多个代表人员管理，每个代表人员给各自管理的医生分配1-5个不同的任务。

我可以通过 Ai 聊天界面，通过自然语言，向 Ai 咨询代表、医生等信息和任务分配情况。
