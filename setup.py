from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

setup(
    name="expense_manager_v2",
    version="0.0.1",
    description="Custom Expense Management App for ERPNext",
    author="Bizaxl",
    author_email="admin@bizaxl.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
)
